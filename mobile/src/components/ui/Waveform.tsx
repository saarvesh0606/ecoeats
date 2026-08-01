import { View } from "react-native";
import { WAVEFORM_BARS } from "@/hooks/useAudioLevels";

/** Shortest bar, so silence still reads as a baseline rather than a gap. */
const MIN_HEIGHT_PCT = 8;

/** Fixed slot ids. A bar's identity is its position in the strip, but deriving
 *  the key from the map index trips the linter, so name the slots up front. */
const BAR_IDS = Array.from({ length: WAVEFORM_BARS }, (_, i) => `bar-${i}`);

/**
 * A row of bars whose heights track live microphone loudness.
 *
 * Oldest sample on the left, newest on the right, so speech scrolls across the
 * strip the way a recorder's meter does.
 */
export function Waveform({
	levels,
	active,
}: {
	levels: number[];
	active: boolean;
}) {
	return (
		<View
			// w-full: the panel centres its children, which would otherwise shrink
			// this strip to its content width instead of spanning the card.
			className="w-full flex-row items-center justify-center gap-[3px] h-16"
			accessibilityLabel={active ? "Recording audio level" : "Not recording"}
		>
			{BAR_IDS.map((id, i) => (
				<View
					key={id}
					className={`flex-1 rounded-full ${active ? "bg-forest-600" : "bg-gray-200"}`}
					style={{
						height: `${MIN_HEIGHT_PCT + (levels[i] ?? 0) * (100 - MIN_HEIGHT_PCT)}%`,
					}}
				/>
			))}
		</View>
	);
}
