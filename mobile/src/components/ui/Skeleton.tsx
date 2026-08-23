import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

/**
 * Pulsing placeholders shown while a screen's first data loads.
 *
 * A bare spinner says "something is happening"; a skeleton says "this is what
 * is coming", so the layout doesn't jump when the data lands.
 */
function Shimmer({ className }: { className: string }) {
	const progress = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		// One timing ping-ponged through interpolation, rather than a looped
		// sequence of two timings: same result, and a single segment can't get
		// out of step with itself.
		const loop = Animated.loop(
			Animated.timing(progress, {
				toValue: 1,
				duration: 1500,
				useNativeDriver: true,
			}),
		);
		loop.start();
		return () => loop.stop();
	}, [progress]);

	const opacity = progress.interpolate({
		inputRange: [0, 0.5, 1],
		outputRange: [0.5, 1, 0.5],
	});

	return (
		<Animated.View style={{ opacity }}>
			<View className={`bg-gray-200 ${className}`} />
		</Animated.View>
	);
}

/** One feed card's worth of placeholder: image block, title, meta line. */
export function ListingCardSkeleton() {
	return (
		<View className="bg-card rounded-card overflow-hidden border border-gray-100">
			<Shimmer className="w-full h-48" />
			<View className="p-4 gap-2">
				<Shimmer className="h-5 w-2/3 rounded-md" />
				<Shimmer className="h-4 w-1/2 rounded-md" />
				<View className="flex-row gap-2 mt-1">
					<Shimmer className="h-6 w-20 rounded-full" />
					<Shimmer className="h-6 w-16 rounded-full" />
				</View>
			</View>
		</View>
	);
}

/** A compact row placeholder, for list screens that aren't photo-led. */
export function RowSkeleton() {
	return (
		<View className="bg-card rounded-card p-4 border border-gray-100 flex-row gap-3 items-center">
			<Shimmer className="w-16 h-16 rounded-xl" />
			<View className="flex-1 gap-2">
				<Shimmer className="h-4 w-3/4 rounded-md" />
				<Shimmer className="h-3 w-1/2 rounded-md" />
			</View>
		</View>
	);
}

/** Stable keys: placeholders never reorder, but an index key trips the linter. */
const SLOTS = ["s1", "s2", "s3", "s4", "s5", "s6"];

export function SkeletonList({
	count = 3,
	variant = "card",
}: {
	count?: number;
	variant?: "card" | "row";
}) {
	const Item = variant === "card" ? ListingCardSkeleton : RowSkeleton;
	return (
		<View className="p-4 gap-3">
			{SLOTS.slice(0, count).map((slot) => (
				<Item key={slot} />
			))}
		</View>
	);
}
