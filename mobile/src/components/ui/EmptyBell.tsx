import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

const CYCLE_MS = 2600;
const HALO = 96;

/**
 * The mark for an empty notifications feed: a bell resting inside a slow halo.
 *
 * An empty screen with a static grey icon reads as broken. A calm, breathing
 * one reads as "nothing to do", which is the actual message — so the motion is
 * deliberately slow and small rather than attention-seeking.
 *
 * One clock drives both the halo and the bell (the bell reads it inverted), so
 * they can't drift apart, and there are no delayed starts — those don't
 * reliably begin on react-native-web.
 */
export function EmptyBell() {
	const clock = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(clock, {
					toValue: 1,
					duration: CYCLE_MS / 2,
					useNativeDriver: true,
				}),
				Animated.timing(clock, {
					toValue: 0,
					duration: CYCLE_MS / 2,
					useNativeDriver: true,
				}),
			]),
		);
		loop.start();
		return () => loop.stop();
	}, [clock]);

	return (
		<View
			className="items-center justify-center"
			style={{ width: HALO, height: HALO }}
		>
			<Animated.View
				pointerEvents="none"
				style={{
					position: "absolute",
					width: HALO,
					height: HALO,
					borderRadius: HALO / 2,
					backgroundColor: "#dcf5e7",
					opacity: clock.interpolate({
						inputRange: [0, 1],
						outputRange: [0.35, 0.85],
					}),
					transform: [
						{
							scale: clock.interpolate({
								inputRange: [0, 1],
								outputRange: [0.78, 1],
							}),
						},
					],
				}}
			/>
			<Animated.View
				style={{
					transform: [
						{
							translateY: clock.interpolate({
								inputRange: [0, 1],
								outputRange: [2, -3],
							}),
						},
					],
				}}
			>
				<Ionicons name="notifications-outline" size={34} color="#1B4332" />
			</Animated.View>
		</View>
	);
}
