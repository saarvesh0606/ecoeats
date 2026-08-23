/**
 * Speech-to-text for the food description, per the spec's voice-entry option.
 *
 * Two recognisers behind one interface: the browser's SpeechRecognition on web,
 * and the device recogniser (expo-speech-recognition) on a phone. Callers see
 * the same four things either way, and typing stays available as the fallback
 * the spec also requires.
 *
 * The implementation is chosen once, at module load, rather than branched
 * inside the hook — `Platform.OS` cannot change while the app runs, and picking
 * per render would mean calling a different number of hooks on web and native.
 */

import {
	ExpoSpeechRecognitionModule,
	useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

export interface UseSpeech {
	supported: boolean;
	listening: boolean;
	/** Begin listening; finalised phrases are passed to `onText`. */
	start: () => void;
	stop: () => void;
	error: string | null;
}

/** Shown for anything the recogniser refuses; the cause is rarely actionable. */
const MISHEARD = "Didn't catch that. Try again, or type it.";

// --- web -----------------------------------------------------------------

// Minimal shape of the Web Speech API — TypeScript has no built-in types.
interface WebSpeechRecognition {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	start: () => void;
	stop: () => void;
	onresult:
		| ((event: {
				resultIndex: number;
				results: {
					0: { transcript: string };
					isFinal: boolean;
					length: number;
				}[];
		  }) => void)
		| null;
	onerror: (() => void) | null;
	onend: (() => void) | null;
}

function getRecognition(): WebSpeechRecognition | null {
	if (Platform.OS !== "web" || typeof window === "undefined") return null;
	const w = window as unknown as {
		SpeechRecognition?: new () => WebSpeechRecognition;
		webkitSpeechRecognition?: new () => WebSpeechRecognition;
	};
	const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
	return Ctor ? new Ctor() : null;
}

/** Exported so it can be tested directly — `useSpeech` resolves to one of these
 *  at module load, which a test can't steer without mocking Platform itself. */
export function useWebSpeech(onText: (text: string) => void): UseSpeech {
	const [supported] = useState(() => getRecognition() !== null);
	const [listening, setListening] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const recognitionRef = useRef<WebSpeechRecognition | null>(null);
	const onTextRef = useRef(onText);
	onTextRef.current = onText;

	const stop = useCallback(() => {
		recognitionRef.current?.stop();
		setListening(false);
	}, []);

	const start = useCallback(() => {
		const recognition = getRecognition();
		if (!recognition) {
			setError("Voice input isn't available here — type instead.");
			return;
		}
		recognition.lang = "en-US";
		recognition.continuous = false;
		recognition.interimResults = false;

		recognition.onresult = (event) => {
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i];
				if (result.isFinal) onTextRef.current(result[0].transcript.trim());
			}
		};
		recognition.onerror = () => {
			setError(MISHEARD);
			setListening(false);
		};
		recognition.onend = () => setListening(false);

		setError(null);
		setListening(true);
		recognition.start();
		recognitionRef.current = recognition;
	}, []);

	useEffect(() => () => recognitionRef.current?.stop(), []);

	return { supported, listening, start, stop, error };
}

// --- native --------------------------------------------------------------

/** Exported for the same reason as `useWebSpeech`. */
export function useNativeSpeech(onText: (text: string) => void): UseSpeech {
	const [listening, setListening] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const onTextRef = useRef(onText);
	onTextRef.current = onText;

	// Asked once. A device with no recogniser installed — some Android builds
	// ship without Google's — can't grow one while the screen is open.
	const [supported] = useState(() => {
		try {
			return ExpoSpeechRecognitionModule.isRecognitionAvailable();
		} catch {
			return false;
		}
	});

	useSpeechRecognitionEvent("result", (event) => {
		// Interim results are switched off, but the guard costs nothing and a
		// partial phrase appended to the description would be gibberish.
		if (!event.isFinal) return;
		const text = event.results[0]?.transcript?.trim();
		if (text) onTextRef.current(text);
	});

	useSpeechRecognitionEvent("error", () => {
		setError(MISHEARD);
		setListening(false);
	});

	// `end` fires however recognition finished — a result, a timeout, an error,
	// or the user tapping stop. It is the only reliable place to drop the
	// listening state, and without it the panel would stay red for ever.
	useSpeechRecognitionEvent("end", () => setListening(false));

	const stop = useCallback(() => {
		try {
			ExpoSpeechRecognitionModule.stop();
		} catch {
			// Stopping something that already stopped is not an error worth
			// showing; `end` has already settled the state.
		}
		setListening(false);
	}, []);

	const start = useCallback(() => {
		void (async () => {
			try {
				const { granted } =
					await ExpoSpeechRecognitionModule.requestPermissionsAsync();
				if (!granted) {
					setError("Microphone access is off — type instead.");
					return;
				}

				setError(null);
				setListening(true);
				ExpoSpeechRecognitionModule.start({
					lang: "en-US",
					interimResults: false,
					continuous: false,
					// Drives the waveform. Without this the bars would have nothing to
					// read on a phone and the strip would sit flat while you spoke.
					volumeChangeEventOptions: { enabled: true, intervalMillis: 50 },
				});
			} catch {
				setError(MISHEARD);
				setListening(false);
			}
		})();
	}, []);

	useEffect(
		() => () => {
			try {
				ExpoSpeechRecognitionModule.abort();
			} catch {
				// Leaving the screen mid-phrase; nothing to report.
			}
		},
		[],
	);

	return { supported, listening, start, stop, error };
}

export const useSpeech = Platform.OS === "web" ? useWebSpeech : useNativeSpeech;
