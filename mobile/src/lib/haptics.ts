import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Physical feedback, named for what just happened rather than for which
 * generator produces it.
 *
 * Call sites say `haptics.select()`, not "run a light impact" — so the mapping
 * from meaning to hardware lives here, in one table per platform, and can be
 * retuned without touching a single screen.
 *
 *  - `tap`     an action control took the press
 *  - `press`   a heavier or destructive control took the press
 *  - `select`  a value changed — a chip, a tab, a star, a stepper
 *  - `bump`    the press landed but nothing moved, because it hit a limit
 *  - `success` / `warning` / `error`  how an action turned out
 *
 * Deliberately absent: plain navigation. Tapping a card to open it, or a back
 * button, gets nothing. iOS itself stays quiet there, and feedback on every
 * touch stops meaning anything.
 */
export type Feel =
	| "tap"
	| "press"
	| "select"
	| "bump"
	| "success"
	| "warning"
	| "error";

/**
 * iOS drives the Taptic Engine through UIKit's three generators. The impact
 * styles are picked for the weight of the control: Light for something small
 * and crisp, Medium for something consequential, Rigid for the unyielding thud
 * of a control that refused to move.
 *
 * Web rides along on this same table: expo-haptics' web implementation covers
 * exactly these three calls, reaching `navigator.vibrate` where it exists and a
 * hidden switch toggle on iOS Safari. Nothing happens on a desktop pointer.
 */
const UIKIT: Record<Feel, () => Promise<void>> = {
	tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
	press: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
	select: () => Haptics.selectionAsync(),
	bump: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
	success: () =>
		Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
	warning: () =>
		Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
	error: () =>
		Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};

/**
 * Android gets its own named effects rather than the UIKit table. expo-haptics
 * is explicit about why: these are tuned effects rather than raw `Vibrator`
 * pulses, so they read as taps instead of buzzes, and they need no VIBRATE
 * permission. Android has no distinct warning, so a warning and an error both
 * land as a rejection.
 */
const ANDROID: Record<Feel, Haptics.AndroidHaptics> = {
	tap: Haptics.AndroidHaptics.Virtual_Key,
	press: Haptics.AndroidHaptics.Long_Press,
	select: Haptics.AndroidHaptics.Segment_Tick,
	bump: Haptics.AndroidHaptics.Reject,
	success: Haptics.AndroidHaptics.Confirm,
	warning: Haptics.AndroidHaptics.Reject,
	error: Haptics.AndroidHaptics.Reject,
};

/**
 * Two pulses closer together than this are one event felt twice, not two
 * events. A nested control is the usual cause — the bookmark inside a feed card
 * is pressed through the card — and the doubled pulse is what makes an
 * interface feel buzzy rather than precise. Comfortably below the ~125ms of
 * even a fast repeated tap, so nothing intentional is ever swallowed.
 */
const MIN_GAP_MS = 45;

/** Outcomes are rare, earned and meaningful, so they are never suppressed. */
const THROTTLED: readonly Feel[] = ["tap", "press", "select", "bump"];

let lastAt = 0;

function fire(feel: Feel): void {
	if (THROTTLED.includes(feel)) {
		const now = Date.now();
		if (now - lastAt < MIN_GAP_MS) return;
		lastAt = now;
	}

	try {
		const done =
			Platform.OS === "android"
				? Haptics.performAndroidHapticsAsync(ANDROID[feel])
				: UIKIT[feel]();
		// Fire and forget, and swallow the rejection. A device with no haptic
		// engine, a simulator, or a user who turned system haptics off all reject
		// here, and none of that is a reason to fail the press that caused it.
		void done?.catch?.(() => {});
	} catch {
		// Same reasoning, for a native module that isn't there at all.
	}
}

export const haptics: Record<Feel, () => void> = {
	tap: () => fire("tap"),
	press: () => fire("press"),
	select: () => fire("select"),
	bump: () => fire("bump"),
	success: () => fire("success"),
	warning: () => fire("warning"),
	error: () => fire("error"),
};

/** Test seam: the gap guard is module state, and suites share a module registry. */
export function resetHapticThrottle(): void {
	lastAt = 0;
}
