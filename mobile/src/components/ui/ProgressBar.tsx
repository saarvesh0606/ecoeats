import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

/**
 * A bar that eases to its new width instead of jumping.
 *
 * Stock changes arrive live over SSE, so on the Manage screen this fill is
 * often redrawn while the host is looking at it — animating the change is what
 * makes a claim read as something that just happened.
 *
 * Width can't use the native driver (it's a layout property, not a transform),
 * which is fine for a bar that moves a handful of times per session.
 */
export function ProgressBar({
	percent,
	className = "bg-forest-600",
}: {
	percent: number;
	className?: string;
}) {
	const clamped = Math.max(0, Math.min(100, percent));
	const value = useRef(new Animated.Value(clamped)).current;

	useEffect(() => {
		const animation = Animated.timing(value, {
			toValue: clamped,
			duration: 550,
			useNativeDriver: false,
		});
		animation.start();
		return () => animation.stop();
	}, [clamped, value]);

	const width = value.interpolate({
		inputRange: [0, 100],
		outputRange: ["0%", "100%"],
	});

	return (
		<View className="h-2 bg-gray-100 rounded-full overflow-hidden">
			<Animated.View style={{ width, height: "100%" }}>
				<View className={`h-2 rounded-full ${className}`} />
			</Animated.View>
		</View>
	);
}
