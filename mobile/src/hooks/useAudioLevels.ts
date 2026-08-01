/**
 * Live microphone loudness, for the voice-entry waveform.
 *
 * The bars show what the mic is actually hearing rather than a canned
 * animation: a waveform that moves while you say nothing is a lie, and the one
 * thing a recording indicator has to tell you honestly is whether you are being
 * picked up.
 *
 * Web only, via the Web Audio API. On native `available` stays false and the UI
 * shows the timer without bars — same policy as useSpeech, which is also
 * web-only until the device build adds expo-speech-recognition.
 */

import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

/** Bars drawn in the waveform; also the length of the rolling history. */
export const WAVEFORM_BARS = 32;

/** ~20fps. Every animation frame is wasted work for something this coarse. */
const SAMPLE_INTERVAL_MS = 50;

function silentHistory(): number[] {
	return new Array(WAVEFORM_BARS).fill(0);
}

interface UseAudioLevels {
	/** Newest last, values 0–1. Always WAVEFORM_BARS long. */
	levels: number[];
	/** False when there's no mic access (denied, unsupported, or native). */
	available: boolean;
}

export function useAudioLevels(active: boolean): UseAudioLevels {
	const [levels, setLevels] = useState<number[]>(silentHistory);
	const [available, setAvailable] = useState(false);
	const historyRef = useRef<number[]>(silentHistory());

	useEffect(() => {
		if (!active || Platform.OS !== "web" || typeof window === "undefined") {
			historyRef.current = silentHistory();
			setLevels(silentHistory());
			setAvailable(false);
			return;
		}

		let stream: MediaStream | null = null;
		let context: AudioContext | null = null;
		let timer: ReturnType<typeof setInterval> | null = null;
		let cancelled = false;

		async function listen() {
			try {
				const media = navigator.mediaDevices;
				if (!media?.getUserMedia) return;
				stream = await media.getUserMedia({ audio: true });
				if (cancelled) {
					for (const track of stream.getTracks()) track.stop();
					return;
				}

				const Ctor =
					window.AudioContext ??
					(window as unknown as { webkitAudioContext?: typeof AudioContext })
						.webkitAudioContext;
				if (!Ctor) return;

				context = new Ctor();
				const analyser = context.createAnalyser();
				analyser.fftSize = 256;
				context.createMediaStreamSource(stream).connect(analyser);

				const samples = new Uint8Array(analyser.fftSize);
				setAvailable(true);

				timer = setInterval(() => {
					analyser.getByteTimeDomainData(samples);
					// RMS around the 128 midpoint of unsigned 8-bit PCM.
					let sum = 0;
					for (const sample of samples) {
						const centred = (sample - 128) / 128;
						sum += centred * centred;
					}
					const rms = Math.sqrt(sum / samples.length);
					// Speech sits low in this range; scale so normal talking fills the
					// bars rather than nudging them.
					const level = Math.min(1, rms * 3.2);
					historyRef.current = [...historyRef.current.slice(1), level];
					setLevels(historyRef.current);
				}, SAMPLE_INTERVAL_MS);
			} catch {
				// Permission denied or no device — fall back to a bar-less panel.
				setAvailable(false);
			}
		}

		void listen();

		return () => {
			cancelled = true;
			if (timer) clearInterval(timer);
			if (stream) for (const track of stream.getTracks()) track.stop();
			void context?.close();
			historyRef.current = silentHistory();
			setLevels(silentHistory());
			setAvailable(false);
		};
	}, [active]);

	return { levels, available };
}
