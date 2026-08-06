import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { haptics, resetHapticThrottle } from "./haptics";

// The real module reads AndroidHaptics eagerly to build its table, so the enums
// have to exist at import time, not just the functions.
jest.mock("expo-haptics", () => ({
	impactAsync: jest.fn(async () => {}),
	notificationAsync: jest.fn(async () => {}),
	selectionAsync: jest.fn(async () => {}),
	performAndroidHapticsAsync: jest.fn(async () => {}),
	ImpactFeedbackStyle: {
		Light: "light",
		Medium: "medium",
		Heavy: "heavy",
		Soft: "soft",
		Rigid: "rigid",
	},
	NotificationFeedbackType: {
		Success: "success",
		Warning: "warning",
		Error: "error",
	},
	AndroidHaptics: {
		Virtual_Key: "virtual-key",
		Long_Press: "long-press",
		Segment_Tick: "segment-tick",
		Reject: "reject",
		Confirm: "confirm",
	},
}));

const realOS = Object.getOwnPropertyDescriptor(Platform, "OS");

/** Pretend to be a given platform for the duration of one test. */
function on(os: "ios" | "android" | "web") {
	Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

beforeEach(() => {
	jest.clearAllMocks();
	// The gap guard is module-level state and every test in this file shares one
	// module registry, so a fast suite would otherwise swallow the second test's
	// first pulse.
	resetHapticThrottle();
	on("ios");
});

afterEach(() => {
	if (realOS) Object.defineProperty(Platform, "OS", realOS);
});

describe("haptics on iOS", () => {
	it("gives a press a light impact and a heavy action a medium one", () => {
		haptics.tap();
		expect(Haptics.impactAsync).toHaveBeenCalledWith("light");

		resetHapticThrottle();
		haptics.press();
		expect(Haptics.impactAsync).toHaveBeenCalledWith("medium");
	});

	it("uses the selection generator for a value change", () => {
		haptics.select();
		expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
		expect(Haptics.impactAsync).not.toHaveBeenCalled();
	});

	it("uses a rigid impact for a control that refused to move", () => {
		// Distinct from `select` on purpose: the stepper at its limit must not feel
		// the same as the stepper stepping.
		haptics.bump();
		expect(Haptics.impactAsync).toHaveBeenCalledWith("rigid");
	});

	it("maps each outcome to its own notification pattern", () => {
		haptics.success();
		haptics.warning();
		haptics.error();
		expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(1, "success");
		expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(2, "warning");
		expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(3, "error");
	});
});

describe("haptics on Android", () => {
	beforeEach(() => on("android"));

	it("routes through Android's own effects, not the Vibrator-backed impacts", () => {
		// impactAsync on Android is a raw Vibrator pulse and needs the VIBRATE
		// permission; the named effects are tuned and need neither.
		haptics.tap();
		expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith("virtual-key");
		expect(Haptics.impactAsync).not.toHaveBeenCalled();
	});

	it("confirms a success and rejects a failure", () => {
		haptics.success();
		haptics.error();
		expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(1, "confirm");
		expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(2, "reject");
		expect(Haptics.notificationAsync).not.toHaveBeenCalled();
	});
});

describe("the gap guard", () => {
	it("collapses one touch felt twice into a single pulse", () => {
		// The bookmark inside a feed card is pressed through the card, so both fire
		// for one finger. Two pulses a few milliseconds apart is what makes an
		// interface feel buzzy rather than precise.
		haptics.tap();
		haptics.select();

		expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
		expect(Haptics.selectionAsync).not.toHaveBeenCalled();
	});

	it("never suppresses an outcome", () => {
		// Outcomes are rare and carry meaning. A claim landing right after the tap
		// that caused it must still be felt.
		haptics.tap();
		haptics.success();

		expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
		expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
	});

	it("lets a deliberate second press through once the gap has passed", () => {
		const realNow = Date.now;
		let clock = 1_000_000;
		Date.now = () => clock;
		try {
			haptics.select();
			clock += 500;
			haptics.select();
			expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
		} finally {
			Date.now = realNow;
		}
	});
});

describe("when the device can't do it", () => {
	it("swallows a rejection rather than failing the press that caused it", async () => {
		// A simulator, a device with no engine, or system haptics switched off all
		// reject here. None of that should reach the handler.
		(Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(
			new Error("unavailable"),
		);

		expect(() => haptics.tap()).not.toThrow();
		await Promise.resolve();
	});

	it("survives a module that throws outright", () => {
		(Haptics.selectionAsync as jest.Mock).mockImplementationOnce(() => {
			throw new Error("no native module");
		});

		expect(() => haptics.select()).not.toThrow();
	});
});
