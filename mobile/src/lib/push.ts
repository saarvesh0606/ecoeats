import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "@/lib/api";

/**
 * Registering this device to receive push notifications.
 *
 * Everything here is best-effort. A user who declines notifications, or is on
 * a platform that can't deliver them, must lose nothing but the notifications
 * themselves — the in-app Activity feed is the real record and is unaffected.
 * So nothing throws, and every failure returns null.
 */

/** Where push genuinely cannot work, whatever the user says. */
function unsupported(): string | null {
	// Expo push runs through APNs and FCM. The web build has neither; browser
	// push is a different mechanism entirely and isn't wired up.
	if (Platform.OS === "web") return "web";
	// A simulator has no push token to give. Asking anyway throws.
	if (!Device.isDevice) return "simulator";
	return null;
}

/**
 * Whether the OS itself is refusing notifications for this device.
 *
 * Different from the app's own mute switch, and not fixable from inside the
 * app: iOS asks about notifications once per install and never again, so a
 * refusal made months ago silently outlives every later sign-in. Somewhere has
 * to say so, or the mute switch reads as the only thing standing between the
 * user and a notification while the OS quietly drops them all.
 *
 * False wherever the answer isn't meaningful — web, a simulator, or a call
 * that throws — because a warning nobody can act on is worse than none.
 */
export async function isPushBlockedByOS(): Promise<boolean> {
	if (unsupported()) return false;
	try {
		const { granted } = await Notifications.getPermissionsAsync();
		return !granted;
	} catch {
		return false;
	}
}

/**
 * Ask for permission and hand the resulting token to the API.
 *
 * Called after sign-in rather than at launch: the token belongs to an account,
 * and asking a stranger for notification permission before they've even signed
 * in is the surest way to be refused for good.
 *
 * Re-registering on every sign-in is deliberate. Expo rotates tokens, and the
 * server uses each registration to keep `last_seen_at` fresh; the endpoint is
 * idempotent precisely so this can be careless.
 */
export async function registerForPush(): Promise<string | null> {
	if (unsupported()) return null;

	try {
		const existing = await Notifications.getPermissionsAsync();
		let granted = existing.granted;

		// Only ask if we haven't been refused already. Re-prompting a user who
		// said no is both futile (the OS won't show it twice) and rude.
		if (!granted && existing.canAskAgain) {
			granted = (await Notifications.requestPermissionsAsync()).granted;
		}
		if (!granted) return null;

		// Android delivers nothing without a channel, and silently: no error,
		// no notification. It has to exist before the first message arrives.
		if (Platform.OS === "android") {
			await Notifications.setNotificationChannelAsync("default", {
				name: "EcoEats",
				importance: Notifications.AndroidImportance.DEFAULT,
			});
		}

		const projectId = getProjectId();
		if (!projectId) return null;

		const { data: token } = await Notifications.getExpoPushTokenAsync({
			projectId,
		});

		await api.post("/devices", { token, platform: Platform.OS });
		return token;
	} catch {
		// No token, an offline registration call, a project without push
		// credentials — none of it is worth surfacing to someone who has just
		// signed in successfully.
		return null;
	}
}

/** Stop this device receiving pushes for the account signing out. */
export async function unregisterForPush(token: string | null): Promise<void> {
	if (!token) return;
	try {
		await api.del("/devices", { token });
	} catch {
		// Signing out must not fail because the network did. The server prunes
		// the token anyway the first time Expo reports it undeliverable.
	}
}

/**
 * The EAS project id, which `getExpoPushTokenAsync` cannot work without.
 *
 * It only exists once `eas init` has run, so this returns null in a project
 * that has never been linked — which is why push is inert rather than broken
 * before then.
 */
function getProjectId(): string | null {
	// Required lazily: expo-constants reads a manifest that isn't present in
	// every environment, and this file is imported by tests.
	const Constants = require("expo-constants").default;
	return (
		Constants?.expoConfig?.extra?.eas?.projectId ??
		Constants?.easConfig?.projectId ??
		null
	);
}
