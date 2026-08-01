import { type ReactNode, useRef } from "react";
import {
	Animated,
	Pressable,
	type PressableProps,
	View,
	type ViewStyle,
} from "react-native";

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
 * like it landed on something physical.
 *
 * Two deliberate structural choices:
 *  - the Pressable itself stays un-animated. Animating it breaks press handling
 *    on react-native-web: the transform moves the element mid-gesture, the
 *    responder decides the pointer left it, and onPress never fires.
 *  - the styled box is a plain View inside the animated one, so NativeWind
 *    applies className normally without needing interop on an animated
 *    component (which fails silently and strips every style).
 */
export function PressableScale({
	children,
	scaleTo = 0.97,
	style,
	className,
	...props
}: PressableScaleProps) {
	const scale = useRef(new Animated.Value(1)).current;

	const springTo = (value: number) =>
		Animated.spring(scale, {
			toValue: value,
			useNativeDriver: true,
			speed: 40,
			bounciness: 4,
		}).start();

	return (
		<Pressable
			{...props}
			onPressIn={(e) => {
				springTo(scaleTo);
				props.onPressIn?.(e);
			}}
			onPressOut={(e) => {
				springTo(1);
				props.onPressOut?.(e);
			}}
		>
			<Animated.View style={{ transform: [{ scale }] }}>
				<View className={className} style={style}>
					{children}
				</View>
			</Animated.View>
		</Pressable>
	);
}
