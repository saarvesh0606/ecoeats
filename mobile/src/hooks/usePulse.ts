import { useEffect, useState } from "react";

/** How often the phase advances. ~20fps is plenty for slow ambient motion. */
const TICK_MS = 50;

/**
 * A 0 → 1 → 0 triangle wave, for looping ambient motion.
 *
 * Driven by an interval and React state rather than `Animated.loop`. Animated
 * runs on requestAnimationFrame, which browsers pause outright while a tab
 * isn't being painted — so a looped Animated value is both invisible and
 * unverifiable in a headless/backgrounded pane. A timer keeps advancing (albeit
 * throttled), which makes this observable in automation as well as on screen.
 *
 * Only for small ornaments. Anything driving layout or a long list wants a real
 * animation, not a state update per frame.
 */
export function usePulse(cycleMs: number): number {
	const [phase, setPhase] = useState(0);

	useEffect(() => {
		const step = TICK_MS / cycleMs;
		const id = setInterval(() => {
			setPhase((p) => (p + step) % 1);
		}, TICK_MS);
		return () => clearInterval(id);
	}, [cycleMs]);

	// Fold the 0..1 ramp back on itself so the motion eases out and returns
	// rather than snapping at the wrap point.
	return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
}
