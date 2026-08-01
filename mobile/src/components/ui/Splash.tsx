import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";

/** How long one ripple takes to travel out and fade. */
const RIPPLE_MS = 2600;
/** Evenly spaced phases, so a new ring leaves as the previous is mid-flight. */
const PHASES = [0, 1 / 3, 2 / 3];

const LOGO_SIZE = 64;
const MAX_SCALE = 2.9;
const PEAK_OPACITY = 0.45;

/**
 * One expanding ring.
 *
 * Every ring reads the *same* clock and offsets itself by interpolation rather
 * than by starting late. Delayed animations don't reliably start on
 * react-native-web — a staggered list built that way left its rows stuck on the
 * opening frame — so the stagger here is arithmetic, not scheduling. It also
 * keeps the rings exactly in step, which per-ring timers would drift out of.
 */
function Ripple({ clock, phase }: { clock: Animated.Value; phase: number }) {
	// With no offset the ring runs straight through; otherwise it wraps, which
	// needs a hard reset at the wrap point (interpolate wants strictly
	// increasing inputs, hence the epsilon).
	const wrap = 1 - phase;
	const epsilon = 0.0001;

	const scale =
		phase === 0
			? clock.interpolate({ inputRange: [0, 1], outputRange: [1, MAX_SCALE] })
			: clock.interpolate({
					inputRange: [0, wrap, wrap + epsilon, 1],
					outputRange: [
						1 + (MAX_SCALE - 1) * phase,
						MAX_SCALE,
						1,
						1 + (MAX_SCALE - 1) * phase,
					],
				});

	const opacity =
		phase === 0
			? clock.interpolate({ inputRange: [0, 1], outputRange: [PEAK_OPACITY, 0] })
			: clock.interpolate({
					inputRange: [0, wrap, wrap + epsilon, 1],
					outputRange: [
						PEAK_OPACITY * (1 - phase),
						0,
						PEAK_OPACITY,
						PEAK_OPACITY * (1 - phase),
					],
				});

	return (
		<Animated.View
			pointerEvents="none"
			style={{
				position: "absolute",
				width: LOGO_SIZE,
				height: LOGO_SIZE,
				borderRadius: LOGO_SIZE / 2,
				borderWidth: 2,
				borderColor: "#86d6ad",
				opacity,
				transform: [{ scale }],
			}}
		/>
	);
}

/**
 * The first thing the app shows, and the screen it falls back to whenever it
 * can't yet say who you are.
 *
 * It covers two waits that would otherwise flash different colours at you: the
 * editorial fonts loading, and the auth check resolving. Holding one branded
 * screen across both makes startup read as a single moment rather than a
 * stutter.
 */
export function Splash() {
	const clock = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const loop = Animated.loop(
			Animated.timing(clock, {
				toValue: 1,
				duration: RIPPLE_MS,
				useNativeDriver: true,
			}),
		);
		loop.start();
		return () => loop.stop();
	}, [clock]);

	return (
		<View className="flex-1 bg-forest-800 items-center justify-center">
			<View className="items-center justify-center" style={{ height: 180 }}>
				{PHASES.map((phase) => (
					<Ripple key={phase} clock={clock} phase={phase} />
				))}
				<View
					className="bg-forest-600/40 items-center justify-center"
					style={{
						width: LOGO_SIZE,
						height: LOGO_SIZE,
						borderRadius: LOGO_SIZE / 2,
					}}
				>
					<Ionicons name="leaf" size={30} color="#86d6ad" />
				</View>
			</View>

			<Text className="font-display-bold text-2xl text-white -mt-6">
				EcoEats
			</Text>
			<Text className="font-body text-forest-100/70 text-sm mt-1">
				Rescue food. Feed people.
			</Text>
		</View>
	);
}
