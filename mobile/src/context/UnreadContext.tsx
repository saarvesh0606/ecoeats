import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { AppState } from "react-native";
import { fetchNotifications } from "@/lib/notifications";

interface UnreadValue {
	/** How many notifications the user hasn't seen. */
	unread: number;
	/** Re-read the count from the server. */
	refresh: () => Promise<void>;
	/** Everything has been seen — the Activity list was opened. */
	clear: () => void;
	/** One unread row was removed without being read. */
	drop: () => void;
}

const UnreadContext = createContext<UnreadValue>({
	unread: 0,
	refresh: async () => {},
	clear: () => {},
	drop: () => {},
});

export function useUnread(): UnreadValue {
	return useContext(UnreadContext);
}

/**
 * How many notifications are waiting, for the dot on the bell.
 *
 * Shared state rather than each screen counting for itself: the bell appears on
 * both home screens and the Activity list clears the count, so three places
 * need the same number and would otherwise disagree.
 *
 * ⚠️ It re-reads the whole list to get one number — there is no count-only
 * endpoint, and `/notifications` is capped at 50 rows. Cheap enough at campus
 * scale, and it avoids a second endpoint that could drift from the first. Worth
 * revisiting if the app ever gets busy.
 */
export function UnreadProvider({ children }: { children: ReactNode }) {
	const [unread, setUnread] = useState(0);

	const refresh = useCallback(async () => {
		try {
			const list = await fetchNotifications();
			setUnread(list.unread_count);
		} catch {
			// A failed count is not worth surfacing; the dot simply doesn't move.
		}
	}, []);

	const clear = useCallback(() => setUnread(0), []);
	const drop = useCallback(() => setUnread((n) => Math.max(0, n - 1)), []);

	useEffect(() => {
		void refresh();

		// A push that arrives while the app is backgrounded doesn't touch this
		// state, so the count is stale the moment the user comes back. Coming to
		// the foreground is exactly when they're about to look at the bell.
		const sub = AppState.addEventListener("change", (next) => {
			if (next === "active") void refresh();
		});
		return () => sub.remove();
	}, [refresh]);

	return (
		<UnreadContext.Provider value={{ unread, refresh, clear, drop }}>
			{children}
		</UnreadContext.Provider>
	);
}
