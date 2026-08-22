import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useRef } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { haptics } from "@/lib/haptics";

/** How far the row slides to expose the action beneath it. */
const REVEAL = 88;
/** Drag past this fraction of REVEAL and the row stays open on release. */
const OPEN_THRESHOLD = 0.4;
/** Horizontal movement needed before we claim the gesture from the scroller. */
const CLAIM_SLOP = 8;
/** How much more horizontal than vertical a drag must be to read as a swipe. */
const DIRECTION_RATIO = 1.2;

/**
 * The gesture rules, kept out of the component so they can be tested directly.
 *
 * Driving a real gesture in a test means fabricating React Native's internal
 * touch history, which tests the framework more than this component. These are
 * the decisions that actually made the row feel wrong, and they are all pure.
 */
export const SWIPE_POLICY = {
	/**
	 * Never hand the gesture back to the list once it is ours.
	 *
	 * ⚠️ This must stay false. PanResponder defaults it to TRUE, and a
	 * scrolling FlatList asks for the gesture back the instant a drag picks up
	 * any vertical component — mid-swipe, finger still down. Granting it
	 * terminated the pan and snapped the row shut for no reason the user could
	 * see, which read as the row randomly refusing to open.
	 */
	yieldToScroller: false,

	/** Whether a drag is deliberate and horizontal enough to be a swipe. */
	claims(dx: number, dy: number, open: boolean): boolean {
		if (Math.abs(dx) < CLAIM_SLOP) return false;
		// Vertical drags belong to the list. Claiming them would make the whole
		// feed feel stuck.
		if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return false;
		// Leftwards to open, rightwards to close again — never the reverse, or a
		// closed row would drag off the wrong edge.
		return open ? dx > 0 : dx < 0;
	},

	/** Keep the row between fully closed and fully revealed. */
	clamp(x: number): number {
		return Math.max(-REVEAL, Math.min(0, x));
	},

	/** Where the row belongs once the finger lifts. */
	opensOnRelease(endX: number): boolean {
		return endX < -REVEAL * OPEN_THRESHOLD;
	},
};

/**
 * A row that slides left to reveal a delete action on the trailing edge.
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
	/** Where the row sat when the current gesture began. */
	const startRef = useRef(0);
	const openRef = useRef(false);
	/** Whether the drag is currently far enough to stay open on release. */
	const armedRef = useRef(false);

	const settle = (toOpen: boolean) => {
		openRef.current = toOpen;
		armedRef.current = toOpen;
		startRef.current = toOpen ? -REVEAL : 0;
		Animated.spring(translateX, {
			toValue: toOpen ? -REVEAL : 0,
			// ⚠️ JS driver deliberately. onPanResponderMove writes this value with
			// setValue(), and a value the native driver owns cannot also be driven
			// from JS — the two write the same node and the row visibly jumps.
			// One row's transform is nothing to animate on the JS thread.
			useNativeDriver: false,
			speed: 20,
			bounciness: 6,
		}).start();
	};

	const responder = useRef(
		PanResponder.create({
			onMoveShouldSetPanResponder: (_e, g) =>
				SWIPE_POLICY.claims(g.dx, g.dy, openRef.current),

			onPanResponderTerminationRequest: () => SWIPE_POLICY.yieldToScroller,

			onPanResponderGrant: () => {
				// A spring from the last gesture may still be running. Take over
				// from wherever the row actually is, or the first frames of the new
				// drag fight an animation that is still writing the same value.
				translateX.stopAnimation((value: number) => {
					startRef.current = SWIPE_POLICY.clamp(value);
				});
			},

			onPanResponderMove: (_e, g) => {
				const next = SWIPE_POLICY.clamp(startRef.current + g.dx);
				translateX.setValue(next);

				// Pulse the moment the drag passes the point where letting go would
				// leave the row open, while the finger is still down. That turns an
				// invisible threshold into something you can feel for, so you stop
				// pulling exactly when it has caught rather than guessing and
				// checking. Only on the way in — ticking on every wobble across the
				// line would be noise.
				const armed = SWIPE_POLICY.opensOnRelease(next);
				if (armed !== armedRef.current) {
					armedRef.current = armed;
					if (armed) haptics.tap();
				}
			},

			onPanResponderRelease: (_e, g) =>
				settle(SWIPE_POLICY.opensOnRelease(startRef.current + g.dx)),

			// If the gesture is taken anyway, settle from where the row actually
			// is rather than discarding the drag and jumping back to the start.
			onPanResponderTerminate: (_e, g) =>
				settle(SWIPE_POLICY.opensOnRelease(startRef.current + g.dx)),
		}),
	).current;

	return (
		<View className="relative">
			{/* Sits underneath on the trailing edge, exposed as the row moves off it. */}
			<View
				className="absolute right-0 top-0 bottom-0 justify-center"
				style={{ width: REVEAL }}
			>
				<Pressable
					onPress={onDelete}
					className="bg-red-600 rounded-card items-center justify-center py-4 ml-2"
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
