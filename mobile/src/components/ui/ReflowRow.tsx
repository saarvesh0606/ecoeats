import type { ReactNode } from "react";
import Animated, { LinearTransition } from "react-native-reanimated";

const REFLOW_MS = 220;

/**
 * Animates a list row leaving, and the rows below closing the gap it left.
 *
 * FadeInItem already handles arrival. Removal had nothing: a listing that was
 * claimed out or cancelled was filtered from state, so the row blinked away and
 * everything under it snapped upwards. On a live feed that is a frequent event,
 * not a rare one — the recipient screen is driven by SSE, so rows disappear
 * while the user is looking at them rather than only between visits.
 *
 * The snap is the larger half of what feels wrong, and it is the half plain
 * Animated cannot fix: it can fade the leaving row, but the siblings' positions
 * are laid out by the parent, so nothing tells them to move gradually.
 * Reanimated's `layout` prop is the mechanism for exactly that. Reanimated is
 * already a dependency — NativeWind pulls it in — so this adds no native code
 * and can therefore ship as an over-the-air update.
 *
 * Kept separate from FadeInItem rather than folded into it: that component is
 * used by three screens, and only the feed removes rows underneath the user.
 *
 * ⚠ There is deliberately no `exiting` animation, and it must stay that way.
 * Reanimated keeps an exiting view mounted until its animation finishes, so
 * removal becomes conditional on frames actually being produced. They are not
 * always: rAF is paused outright while a browser tab isn't painting, and a
 * backgrounded app is the very moment SSE delivers a cancellation. Tried it
 * with FadeOut and the cancelled row was stranded in the list forever, shuffled
 * to the bottom with a frozen countdown while its neighbours ticked on. That is
 * the same trap FadeInItem's timer-based fallback exists to avoid, and the same
 * rule applies: never gate correctness on an animation running.
 *
 * `layout` is safe by contrast — it animates positions but owns no mounting, so
 * when it cannot run the row simply arrives where it belongs without gliding.
 *
 * The reflow defers to the OS "reduce motion" setting, which matters here:
 * someone who turns that on is often doing it because motion makes them ill,
 * and a list reflowing under them is exactly the movement they switched off.
 * That is not spelled out below because ReduceMotion.System is already
 * Reanimated's default — and stating it explicitly breaks the tests, since the
 * shipped Jest mock exposes getReduceMotion() but no chainable reduceMotion().
 */
export function ReflowRow({ children }: { children: ReactNode }) {
	return (
		<Animated.View layout={LinearTransition.duration(REFLOW_MS)}>
			{children}
		</Animated.View>
	);
}
