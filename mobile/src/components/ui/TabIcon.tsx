import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated } from "react-native";

/** Outline when idle, solid when active — the pair for each tab. */
export type TabIconName = keyof typeof ICONS;

const ICONS = {
	discover: ["compass-outline", "compass"],
	claims: ["receipt-outline", "receipt"],
	dashboard: ["grid-outline", "grid"],
	create: ["add-circle-outline", "add-circle"],
	activity: ["notifications-outline", "notifications"],
	profile: ["person-outline", "person"],
} as const;

/**
 * A tab icon that springs up as it becomes the active tab.
 *
 * The colour change alone is easy to miss on a glance, especially between two
 * adjacent tabs; a small lift makes the selection land. Both resting states are
 * fully visible, so if the spring never runs the icon is simply static rather
 * than broken.
 */
export function TabIcon({
	name,
	focused,
	color,
	size,
}: {
	name: TabIconName;
	focused: boolean;
	color: string;
	size: number;
}) {
	const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

	useEffect(() => {
		Animated.spring(progress, {
			toValue: focused ? 1 : 0,
			useNativeDriver: true,
			speed: 18,
			bounciness: 12,
		}).start();
	}, [focused, progress]);

	const [idle, active] = ICONS[name];

	return (
		<Animated.View
			style={{
				transform: [
					{
						scale: progress.interpolate({
							inputRange: [0, 1],
							outputRange: [1, 1.15],
						}),
					},
					{
						translateY: progress.interpolate({
							inputRange: [0, 1],
							outputRange: [0, -2],
						}),
					},
				],
			}}
		>
			<Ionicons name={focused ? active : idle} size={size} color={color} />
		</Animated.View>
	);
}
