import { type ReactNode, useEffect, useRef } from "react";
import { Animated, View } from "react-native";

/** Rows past this don't stagger — the delay would out-run a fast scroll. */
const MAX_STAGGER = 6;
const STEP_MS = 55;
const DURATION_MS = 260;
/** Grace after a row's fade should have finished before we force it visible. */
const SETTLE_MARGIN_MS = 400;

/**
 * Fades and lifts a list row in on mount, staggered by its position.
 *
 * The row is force-set to visible on a timer as well as by the animation.
 * Animated runs on requestAnimationFrame, which a browser pauses outright while
 * the tab isn't painting — so a fade that starts during a pause would otherwise
 * strand the row at opacity 0. A list that renders blank is a far worse outcome
 * than one that didn't animate, and timers keep firing where rAF doesn't.
 *
 * The className goes on an inner plain View: NativeWind doesn't process classes
 * on animated components, and fails silently when you try.
 */
export function FadeInItem({
	children,
	index = 0,
	className,
}: {
	children: ReactNode;
	index?: number;
	className?: string;
}) {
	const progress = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const delay = Math.min(index, MAX_STAGGER) * STEP_MS;

		const start = setTimeout(() => {
			Animated.timing(progress, {
				toValue: 1,
				duration: DURATION_MS,
				useNativeDriver: true,
			}).start();
		}, delay);

		const settle = setTimeout(
			() => progress.setValue(1),
			delay + DURATION_MS + SETTLE_MARGIN_MS,
		);

		return () => {
			clearTimeout(start);
			clearTimeout(settle);
			// Unmounting mid-fade must not leave a recycled row part-way faded.
			progress.setValue(1);
		};
	}, [index, progress]);

	return (
		<Animated.View
			style={{
				opacity: progress,
				transform: [
					{
						translateY: progress.interpolate({
							inputRange: [0, 1],
							outputRange: [10, 0],
						}),
					},
				],
			}}
		>
			{className ? <View className={className}>{children}</View> : children}
		</Animated.View>
	);
}
