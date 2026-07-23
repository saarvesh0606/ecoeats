/**
 * Speech-to-text for the food description, per the spec's voice-entry option.
 *
 * On web it uses the browser's SpeechRecognition API. On a native build it will
 * use the device recogniser (expo-speech-recognition), added when we cut the
 * first native build; until then `supported` is false there and the UI simply
 * hides the mic. Manual typing is always available as the fallback the spec
 * also requires.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

// Minimal shape of the Web Speech API — TypeScript has no built-in types.
interface WebSpeechRecognition {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	start: () => void;
	stop: () => void;
	onresult: ((event: {
		resultIndex: number;
		results: { 0: { transcript: string }; isFinal: boolean; length: number }[];
	}) => void) | null;
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

interface UseSpeech {
	supported: boolean;
	listening: boolean;
	/** Begin listening; finalised phrases are passed to `onText`. */
	start: () => void;
	stop: () => void;
	error: string | null;
}

export function useSpeech(onText: (text: string) => void): UseSpeech {
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
			setError("Didn't catch that. Try again, or type it.");
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
