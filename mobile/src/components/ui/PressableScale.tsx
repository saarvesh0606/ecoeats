import type { ReactNode } from "react";
import { Pressable, type PressableProps, type ViewStyle } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
// Registers className support on Animated.* (see the module for why).
import "@/lib/animatedSetup";

/** Springs back rather than snapping — a linear return reads as a glitch. */
const SPRING = { damping: 15, stiffness: 260, mass: 0.5 };

interface PressableScaleProps extends Omit<PressableProps, "style"> {
	children: ReactNode;
	/** How far it dips on press. Big surfaces need less than small ones. */
	scaleTo?: number;
	className?: string;
	style?: ViewStyle;
}

/**
 * A Pressable that dips slightly while held.
 *
 * `active:opacity-*` gives no sense of depth; a spring scale makes a tap feel
 * like it landed on something physical. The scale runs on the UI thread, so it
 * stays smooth even while the JS thread is busy fetching.
 *
 * The transform deliberately lives on an inner view rather than on the
 * Pressable itself: making the Pressable animated (createAnimatedComponent)
 * breaks press handling on react-native-web — the transform moves the element
 * mid-gesture, the responder decides the pointer left it, and onPress never
 * fires. Keeping the Pressable plain keeps taps reliable everywhere.
 */
export function PressableScale({
	children,
	scaleTo = 0.97,
	style,
	className,
	...props
}: PressableScaleProps) {
	const scale = useSharedValue(1);
	const animated = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<Pressable
			{...props}
			onPressIn={(e) => {
				scale.value = withSpring(scaleTo, SPRING);
				props.onPressIn?.(e);
			}}
			onPressOut={(e) => {
				scale.value = withSpring(1, SPRING);
				props.onPressOut?.(e);
			}}
		>
			<Animated.View className={className} style={[style, animated]}>
				{children}
			</Animated.View>
		</Pressable>
	);
}
