import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";

/**
 * Re-runs something whenever a push lands while the app is open.
 *
 * A push is the one signal that says "the server changed something that
 * concerns you" without the user having done anything. usePushNavigation
 * already leans on it to move the unread dot; this makes the same signal
 * available to a screen that needs to reload itself.
 *
 * Deliberately not filtered by notification kind. Reloading a list is one
 * cheap request, whereas a `kind` the filter forgot about is a screen that
 * silently stops updating — and that failure is invisible until someone is
 * standing in front of the wrong information. Being occasionally too eager is
 * the better way to be wrong.
 *
 * The callback is held in a ref so an inline arrow from the caller doesn't tear
 * the subscription down and rebuild it on every render.
 */
export function useRefreshOnPush(onPush: () => void) {
	const latest = useRef(onPush);
	latest.current = onPush;

	useEffect(() => {
		const received = Notifications.addNotificationReceivedListener(() => {
			latest.current();
		});
		return () => received.remove();
	}, []);
}
