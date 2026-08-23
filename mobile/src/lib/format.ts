/** Human-friendly formatting for the feed and detail views. */

/**
 * Time left before a listing expires, from a live "now".
 *
 * The server sends `expires_at`; the client counts down from it locally, which
 * is why time-remaining needs no realtime channel of its own — only quantity
 * has to be pushed.
 */
export function formatTimeLeft(expiresAt: string, now: number): string {
	const remaining = formatDuration(expiresAt, now);
	return remaining ? `${remaining} left` : "Expired";
}

/**
 * The same countdown with no trailing word — "45m", "1h 30m" — for callers
 * that supply their own phrasing, e.g. "Expires in 45m". Empty once the
 * deadline has passed, so the caller has to say what that means itself.
 */
export function formatDuration(expiresAt: string, now: number): string {
	const ms = new Date(expiresAt).getTime() - now;
	if (ms <= 0) return "";

	const totalMinutes = Math.floor(ms / 60000);
	if (totalMinutes >= 60) {
		const h = Math.floor(totalMinutes / 60);
		const m = totalMinutes % 60;
		return m ? `${h}h ${m}m` : `${h}h`;
	}
	if (totalMinutes >= 1) return `${totalMinutes}m`;
	return `${Math.max(1, Math.floor(ms / 1000))}s`;
}

/** How urgent the countdown is, for colour. */
export function urgency(
	expiresAt: string,
	now: number,
): "high" | "medium" | "low" {
	const minutes = (new Date(expiresAt).getTime() - now) / 60000;
	if (minutes <= 5) return "high";
	if (minutes <= 15) return "medium";
	return "low";
}

export function formatDistance(miles: number | null): string | null {
	if (miles === null) return null;
	if (miles < 0.1) return "Right here";
	if (miles < 1) return `${Math.round(miles * 10) / 10} mi away`;
	return `${Math.round(miles)} mi away`;
}

export function formatLocation(building: string, room: string | null): string {
	return room ? `${building}, Room ${room}` : building;
}
