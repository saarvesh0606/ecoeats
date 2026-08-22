/**
 * Switches that belong to this phone rather than to the account.
 *
 * Muting notifications or turning haptics off is a statement about *this
 * device*: someone signing in on a tablet has not asked that tablet to stay
 * quiet. So these live in device storage, not on the user row.
 *
 * Every read falls back to "on" when storage fails. A missed claim matters more
 * than a stray buzz, and a phone that silently stopped notifying because
 * AsyncStorage hiccuped is the worse failure.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
	pushMuted: "ecoeats.pushMuted",
	hapticsMuted: "ecoeats.hapticsMuted",
} as const;

async function read(key: string): Promise<boolean> {
	try {
		return (await AsyncStorage.getItem(key)) === "true";
	} catch {
		return false;
	}
}

async function write(key: string, value: boolean): Promise<void> {
	try {
		await AsyncStorage.setItem(key, value ? "true" : "false");
	} catch {
		// Best effort. The switch still reflects the choice for this session.
	}
}

export async function arePushNotificationsMuted(): Promise<boolean> {
	return read(KEYS.pushMuted);
}

export async function setPushNotificationsMuted(muted: boolean): Promise<void> {
	return write(KEYS.pushMuted, muted);
}

export async function areHapticsMuted(): Promise<boolean> {
	return read(KEYS.hapticsMuted);
}

export async function setHapticsMuted(muted: boolean): Promise<void> {
	return write(KEYS.hapticsMuted, muted);
}
