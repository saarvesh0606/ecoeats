import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import "@/lib/animatedSetup";

/**
 * A bar that eases to its new width instead of jumping.
 *
 * Stock changes arrive live over SSE, so on the Manage screen this fill is
 * often redrawn while the host is looking at it — animating the change is what
 * makes a claim read as something that just happened.
 */
export function ProgressBar({
	percent,
	className = "bg-forest-600",
}: {
	percent: number;
	className?: string;
}) {
	const width = useSharedValue(0);

	useEffect(() => {
		width.value = withTiming(Math.max(0, Math.min(100, percent)), {
			duration: 550,
		});
	}, [percent, width]);

	const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));

	return (
		<View className="h-2 bg-gray-100 rounded-full overflow-hidden">
			<Animated.View className={`h-2 rounded-full ${className}`} style={style} />
		</View>
	);
}
