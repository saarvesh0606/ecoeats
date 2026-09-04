import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { PressableScale } from "@/components/ui/PressableScale";
import { Waveform } from "@/components/ui/Waveform";
import { useAudioLevels } from "@/hooks/useAudioLevels";

/** mm:ss for the recording timer. */
function clock(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * The voice-entry panel: prompt, live waveform, elapsed time, mic button.
 *
 * It owns the audio-level sampling so the ~20fps meter re-renders only this
 * panel and not the whole Create-a-Post form.
 */
export function VoicePanel({
	listening,
	onToggle,
	error,
	blocked = false,
}: {
	listening: boolean;
	onToggle: () => void;
	error?: string | null;
	/** Mic refused for good — show the way to the Settings app. */
	blocked?: boolean;
}) {
	const { levels, available } = useAudioLevels(listening);
	const [seconds, setSeconds] = useState(0);
	const startedAt = useRef(0);

	useEffect(() => {
		if (!listening) {
			setSeconds(0);
			return;
		}
		startedAt.current = Date.now();
		setSeconds(0);
		const id = setInterval(
			() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)),
			500,
		);
		return () => clearInterval(id);
	}, [listening]);

	return (
		<View className="bg-card rounded-card border border-gray-100 p-5 items-center">
			<Text className="font-body text-gray-500 text-sm mb-3">
				{listening
					? "Listening — say what the food is"
					: "Tap to speak about the food"}
			</Text>

			{/* The strip is always present so the panel keeps its shape, but the
			    bars only move on real mic input — a waveform dancing to nothing
			    would be theatre. Idle (or unmeasurable) means a flat grey baseline. */}
			<Waveform levels={levels} active={listening && available} />

			{listening && !available && (
				<Text className="font-body text-gray-400 text-xs mt-1">
					Recording — mic level unavailable here
				</Text>
			)}

			<Text
				className={`font-display-bold text-2xl mt-2 ${listening ? "text-brand" : "text-gray-300"}`}
			>
				{clock(seconds)}
			</Text>

			<View className="mt-4 items-center">
				<PressableScale
					onPress={onToggle}
					scaleTo={0.92}
					accessibilityRole="button"
					accessibilityLabel={listening ? "Stop recording" : "Start recording"}
					className={`w-16 h-16 rounded-full items-center justify-center ${
						listening ? "bg-red-600" : "bg-forest-700"
					}`}
				>
					<Ionicons
						name={listening ? "stop" : "mic"}
						size={26}
						color="#ffffff"
					/>
				</PressableScale>

				{listening && (
					<Pressable onPress={onToggle} hitSlop={8} className="mt-3">
						<Text className="font-body-semibold text-gray-500 text-sm">
							Cancel
						</Text>
					</Pressable>
				)}
			</View>

			{error && (
				<Text className="font-body text-xs text-red-500 mt-3 text-center">
					{error}
				</Text>
			)}

			{/* Without this the panel is a dead end: iOS asks for the microphone
			    once and never again, so "access is off" is a fact the person
			    cannot act on from inside the app. */}
			{blocked && (
				<Pressable
					onPress={() => void Linking.openSettings()}
					hitSlop={8}
					className="mt-2"
					accessibilityRole="button"
					accessibilityLabel="Open Settings to turn on the microphone"
				>
					<Text className="font-body-semibold text-brand text-sm underline">
						Open Settings
					</Text>
				</Pressable>
			)}
		</View>
	);
}
