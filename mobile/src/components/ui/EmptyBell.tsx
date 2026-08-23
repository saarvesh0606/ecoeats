import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { usePulse } from "@/hooks/usePulse";
import { theme } from "@/hooks/useThemeColors";

const CYCLE_MS = 2600;
const HALO = 96;

/**
 * The mark for an empty notifications feed: a bell resting inside a slow halo.
 *
 * An empty screen with a static grey icon reads as broken. A calm, breathing
 * one reads as "nothing to do", which is the actual message — so the motion is
 * deliberately slow and small rather than attention-seeking.
 *
 * One pulse drives the halo and the bell together, so they can't drift apart.
 */
export function EmptyBell() {
	const pulse = usePulse(CYCLE_MS);

	return (
		<View
			className="items-center justify-center"
			style={{ width: HALO, height: HALO }}
		>
			<View
				pointerEvents="none"
				style={{
					position: "absolute",
					width: HALO,
					height: HALO,
					borderRadius: HALO / 2,
					backgroundColor: theme.halo,
					opacity: 0.35 + pulse * 0.5,
					transform: [{ scale: 0.78 + pulse * 0.22 }],
				}}
			/>
			<View style={{ transform: [{ translateY: 2 - pulse * 5 }] }}>
				<Ionicons name="notifications-outline" size={34} color={theme.brand} />
			</View>
		</View>
	);
}
