import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useRef } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { haptics } from "@/lib/haptics";

/** How far the row slides to expose the action beneath it. */
const REVEAL = 88;
/** Drag past this fraction of REVEAL and the row stays open on release. */
const OPEN_THRESHOLD = 0.4;
/** Horizontal movement needed before we claim the gesture from the scroller. */
const CLAIM_SLOP = 12;

/**
 * A row that slides right to reveal a delete action.
 *
 * The gesture is only claimed once the drag is clearly horizontal and to the
 * right, so vertical scrolling through the list still wins — grabbing every
 * touch would make the feed feel stuck.
 *
 * Deleting is a two-step act on purpose: the swipe exposes the control, and a
 * separate tap commits it. A single swipe that deletes outright is far too easy
 * to trigger while scrolling.
 */
export function SwipeableRow({
	children,
	onDelete,
	deleteLabel = "Delete",
}: {
	children: ReactNode;
	onDelete: () => void;
	deleteLabel?: string;
}) {
	const translateX = useRef(new Animated.Value(0)).current;
	const openRef = useRef(false);
	/** Whether the drag is currently far enough to stay open on release. */
	const armedRef = useRef(false);

	const settle = (toOpen: boolean) => {
		openRef.current = toOpen;
		armedRef.current = toOpen;
		Animated.spring(translateX, {
			toValue: toOpen ? REVEAL : 0,
			useNativeDriver: true,
			speed: 20,
			bounciness: 6,
		}).start();
	};

	const responder = useRef(
		PanResponder.create({
			onMoveShouldSetPanResponder: (_e, g) =>
				Math.abs(g.dx) > CLAIM_SLOP &&
				Math.abs(g.dx) > Math.abs(g.dy) * 1.5 &&
				// Rightwards when closed; leftwards (to re-close) when open.
				(openRef.current ? g.dx < 0 : g.dx > 0),
			onPanResponderMove: (_e, g) => {
				const base = openRef.current ? REVEAL : 0;
				const next = Math.min(REVEAL, Math.max(0, base + g.dx));
				translateX.setValue(next);

				// Pulse the moment the drag passes the point where letting go would
				// leave the row open, while the finger is still down. That turns an
				// invisible threshold into something you can feel for, so you stop
				// pulling exactly when it has caught rather than guessing and
				// checking. Only on the way in — ticking on every wobble across the
				// line would be noise.
				const armed = next > REVEAL * OPEN_THRESHOLD;
				if (armed !== armedRef.current) {
					armedRef.current = armed;
					if (armed) haptics.tap();
				}
			},
			onPanResponderRelease: (_e, g) => {
				const base = openRef.current ? REVEAL : 0;
				const end = base + g.dx;
				settle(end > REVEAL * OPEN_THRESHOLD);
			},
			onPanResponderTerminate: () => settle(openRef.current),
		}),
	).current;

	return (
		<View className="relative">
			{/* Sits underneath, exposed as the row moves off it. */}
			<View
				className="absolute left-0 top-0 bottom-0 justify-center"
				style={{ width: REVEAL }}
			>
				<Pressable
					onPress={onDelete}
					className="bg-red-600 rounded-card items-center justify-center py-4 mr-2"
					accessibilityRole="button"
					accessibilityLabel={deleteLabel}
				>
					<Ionicons name="trash-outline" size={20} color="#ffffff" />
					<Text className="font-body-semibold text-white text-[11px] mt-1">
						{deleteLabel}
					</Text>
				</Pressable>
			</View>

			<Animated.View
				style={{ transform: [{ translateX }] }}
				{...responder.panHandlers}
			>
				{children}
			</Animated.View>
		</View>
	);
}
