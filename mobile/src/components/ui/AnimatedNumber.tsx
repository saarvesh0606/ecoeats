import { useEffect, useState } from "react";
import { Text } from "react-native";

/**
 * Counts up to `value` instead of snapping to it.
 *
 * Used for the impact stats: watching "meals shared" climb makes the number
 * feel earned, which is the whole point of that card. Driven by JS state rather
 * than a shared value because the animated thing is text content, which the UI
 * thread can't rewrite on its own.
 */
export function AnimatedNumber({
	value,
	duration = 900,
	className,
}: {
	value: number;
	duration?: number;
	className?: string;
}) {
	const [shown, setShown] = useState(0);

	useEffect(() => {
		if (value <= 0) {
			setShown(0);
			return;
		}
		const start = Date.now();
		const id = setInterval(() => {
			const t = Math.min((Date.now() - start) / duration, 1);
			// Ease-out: fast at first, settling at the end.
			setShown(Math.round(value * (1 - (1 - t) ** 3)));
			if (t >= 1) clearInterval(id);
		}, 32);
		return () => clearInterval(id);
	}, [value, duration]);

	return <Text className={className}>{shown}</Text>;
}
