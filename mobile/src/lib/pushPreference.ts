/**
 * Whether this device has muted EcoEats notifications from inside the app.
 *
 * Separate from the OS permission on purpose. Revoking permission in iOS
 * Settings is a one-way door — the app can never ask again, and most people
 * don't know to go back and undo it. A switch here lets someone stop the
 * buzzing today and turn it back on tomorrow, without spending that permission.
 *
 * Stored on the device rather than the account: muting is about *this phone*.
 * Someone who signs in on a tablet has not asked that tablet to stay quiet.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "ecoeats.pushMuted";

export async function arePushNotificationsMuted(): Promise<boolean> {
	try {
		return (await AsyncStorage.getItem(KEY)) === "true";
	} catch {
		// Storage failing is not a reason to go silent — the safe default is to
		// keep delivering, since a missed claim matters more than a stray buzz.
		return false;
	}
}

export async function setPushNotificationsMuted(muted: boolean): Promise<void> {
	try {
		await AsyncStorage.setItem(KEY, muted ? "true" : "false");
	} catch {
		// Best effort. The switch still reflects the choice for this session.
	}
}
