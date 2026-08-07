import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * What happens when a push arrives, and when one is tapped.
 *
 * Two separate cases, and they are easy to confuse:
 *
 *  - **Arriving while the app is open.** iOS suppresses the banner by default,
 *    on the assumption that an app on screen will show its own UI. Ours won't —
 *    the Activity tab only refreshes when opened — so the banner is turned
 *    back on and a claim landing while you're browsing is still visible.
 *
 *  - **Tapped.** The response fires whether the app was backgrounded or fully
 *    dead. `getLastNotificationResponseAsync` covers the cold-start case, where
 *    the tap happened before any listener could exist; without it, launching
 *    from a notification just drops you on the feed.
 */
export function usePushNavigation() {
	const router = useRouter();

	useEffect(() => {
		if (Platform.OS === "web") return;

		Notifications.setNotificationHandler({
			handleNotification: async () => ({
				shouldShowBanner: true,
				shouldShowList: true,
				shouldPlaySound: false,
				shouldSetBadge: false,
			}),
		});

		const open = (response: Notifications.NotificationResponse | null) => {
			const data = response?.notification.request.content.data as
				| { listingId?: string }
				| undefined;
			if (data?.listingId) router.push(`/listing/${data.listingId}`);
		};

		// A tap that launched the app from cold, before this listener existed.
		void Notifications.getLastNotificationResponseAsync().then(open);

		const subscription =
			Notifications.addNotificationResponseReceivedListener(open);
		return () => subscription.remove();
	}, [router]);
}
