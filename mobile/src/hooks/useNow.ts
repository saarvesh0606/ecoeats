import { useEffect, useState } from "react";

/**
 * A clock that re-renders on an interval, so countdowns tick without each card
 * running its own timer. One shared source of "now" for the whole screen.
 */
export function useNow(intervalMs = 10000): number {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);

	return now;
}
