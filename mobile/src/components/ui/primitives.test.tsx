import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Animated, Text } from "react-native";
import { haptics } from "@/lib/haptics";
import { AnimatedNumber } from "./AnimatedNumber";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { FadeInItem } from "./FadeInItem";
import { Input } from "./Input";
import { ProgressBar } from "./ProgressBar";

jest.mock("@/lib/haptics", () => ({
	haptics: {
		tap: jest.fn(),
		press: jest.fn(),
		select: jest.fn(),
		bump: jest.fn(),
		success: jest.fn(),
		warning: jest.fn(),
		error: jest.fn(),
	},
}));

describe("Button", () => {
	it("calls onPress", () => {
		const onPress = jest.fn();
		render(<Button onPress={onPress}>Save</Button>);
		fireEvent.press(screen.getByText("Save"));
		expect(onPress).toHaveBeenCalledTimes(1);
	});

	it("swallows presses while disabled", () => {
		const onPress = jest.fn();
		render(
			<Button onPress={onPress} disabled>
				Save
			</Button>,
		);
		fireEvent.press(screen.getByText("Save"));
		expect(onPress).not.toHaveBeenCalled();
	});

	it("swallows presses while loading, so an action can't be fired twice", () => {
		// Double-submitting a claim is exactly what the backend's 409 exists to
		// catch; the button shouldn't be the thing that causes it.
		const onPress = jest.fn();
		render(
			<Button onPress={onPress} loading>
				Claim
			</Button>,
		);
		expect(screen.queryByText("Claim")).toBeNull(); // replaced by the spinner
		expect(onPress).not.toHaveBeenCalled();
	});

	it("announces its busy state to assistive tech", () => {
		render(
			<Button onPress={() => {}} loading accessibilityLabel="Claim">
				Claim
			</Button>,
		);
		const button = screen.getByLabelText("Claim");
		expect(button.props.accessibilityState).toMatchObject({
			busy: true,
			disabled: true,
		});
	});
});

describe("Button haptics", () => {
	beforeEach(() => jest.clearAllMocks());

	it("fires as the touch lands, not when it is released", () => {
		// The pulse confirms the press registered, so it has to arrive under the
		// finger. On release it lands after the thing it is acknowledging and the
		// whole control reads as laggy.
		render(<Button onPress={() => {}}>Claim</Button>);

		fireEvent(screen.getByText("Claim"), "pressIn");

		expect(haptics.tap).toHaveBeenCalledTimes(1);
	});

	it("gives a destructive button more weight than an affirmative one", () => {
		render(
			<Button variant="danger" onPress={() => {}}>
				End post
			</Button>,
		);

		fireEvent(screen.getByText("End post"), "pressIn");

		expect(haptics.press).toHaveBeenCalledTimes(1);
		expect(haptics.tap).not.toHaveBeenCalled();
	});

	it("stays silent on the retreats", () => {
		// "Cancel", "Try again", "Browse food" are all ghost/outline. A phone that
		// pulses as insistently when you back out as when you commit has stopped
		// saying anything.
		render(
			<Button variant="ghost" onPress={() => {}}>
				Cancel
			</Button>,
		);

		fireEvent(screen.getByText("Cancel"), "pressIn");

		expect(haptics.tap).not.toHaveBeenCalled();
		expect(haptics.press).not.toHaveBeenCalled();
	});

	it("says nothing while disabled, having refused to act", () => {
		render(
			<Button onPress={() => {}} disabled>
				Claim
			</Button>,
		);

		fireEvent(screen.getByText("Claim"), "pressIn");

		expect(haptics.tap).not.toHaveBeenCalled();
	});

	it("lets a call site override the variant's default", () => {
		render(
			<Button variant="outline" haptic="tap" onPress={() => {}}>
				Save as Draft
			</Button>,
		);

		fireEvent(screen.getByText("Save as Draft"), "pressIn");

		expect(haptics.tap).toHaveBeenCalledTimes(1);
	});
});

describe("Input", () => {
	it("labels the field for assistive tech", () => {
		render(<Input label="ASU email" value="" onChangeText={() => {}} />);
		expect(screen.getByLabelText("ASU email")).toBeTruthy();
	});

	it("masks a password by default", () => {
		render(<Input label="Password" secureTextEntry value="hunter22" onChangeText={() => {}} />);
		expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
	});

	it("reveals the password when the eye is tapped", () => {
		// Typing a password blind on a phone keyboard is the most common reason a
		// correct one gets rejected.
		render(<Input label="Password" secureTextEntry value="hunter22" onChangeText={() => {}} />);

		fireEvent.press(screen.getByLabelText("Show password"));

		expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
		expect(screen.getByLabelText("Hide password")).toBeTruthy();
	});

	it("offers no eye on an ordinary field", () => {
		render(<Input label="Name" value="" onChangeText={() => {}} />);
		expect(screen.queryByLabelText("Show password")).toBeNull();
	});

	it("shows an error message when given one", () => {
		render(<Input label="Name" error="Name can't be empty." value="" onChangeText={() => {}} />);
		expect(screen.getByText("Name can't be empty.")).toBeTruthy();
	});
});

describe("Avatar", () => {
	it("takes the first and last initial of a full name", () => {
		render(<Avatar name="Demo Host" />);
		expect(screen.getByText("DH")).toBeTruthy();
	});

	it("uses one letter for a single name", () => {
		render(<Avatar name="taylor" />);
		expect(screen.getByText("T")).toBeTruthy();
	});

	it("ignores the middle of a longer name", () => {
		render(<Avatar name="Sun Devil Jones" />);
		expect(screen.getByText("SJ")).toBeTruthy();
	});

	it("copes with stray whitespace", () => {
		render(<Avatar name="  Demo   Host  " />);
		expect(screen.getByText("DH")).toBeTruthy();
	});

	it("falls back to a dot rather than crashing on an empty name", () => {
		render(<Avatar name="   " />);
		expect(screen.getByText("·")).toBeTruthy();
	});

	it("prefers a photo when there is one", () => {
		render(<Avatar name="Demo Host" uri="https://example.test/a.jpg" />);
		expect(screen.queryByText("DH")).toBeNull();
		expect(screen.getByLabelText("Demo Host")).toBeTruthy();
	});
});

describe("ProgressBar", () => {
	/** The fill's width is an interpolated animated value; read what it resolves to. */
	function fillWidth() {
		return screen.UNSAFE_getByType(Animated.View).props.style.width.__getValue();
	}

	it("fills proportionally", () => {
		render(<ProgressBar percent={50} />);
		expect(fillWidth()).toBe("50%");
	});

	it("clamps above 100, so the fill can't spill past the track", () => {
		// quantity_remaining briefly exceeding the total (a refund landing before a
		// refetch) would otherwise interpolate to a width wider than its container.
		render(<ProgressBar percent={180} />);
		expect(fillWidth()).toBe("100%");
	});

	it("clamps below zero", () => {
		render(<ProgressBar percent={-40} />);
		expect(fillWidth()).toBe("0%");
	});
});

describe("AnimatedNumber", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		act(() => jest.runOnlyPendingTimers());
		jest.useRealTimers();
	});

	it("starts from zero", () => {
		render(<AnimatedNumber value={12} />);
		expect(screen.getByText("0")).toBeTruthy();
	});

	it("arrives exactly on the target, not near it", () => {
		render(<AnimatedNumber value={12} duration={900} />);
		act(() => jest.advanceTimersByTime(1000));
		expect(screen.getByText("12")).toBeTruthy();
	});

	it("shows a plain zero rather than counting to it", () => {
		render(<AnimatedNumber value={0} />);
		act(() => jest.advanceTimersByTime(1000));
		expect(screen.getByText("0")).toBeTruthy();
	});
});

describe("FadeInItem", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		act(() => jest.runOnlyPendingTimers());
		jest.useRealTimers();
	});

	it("renders its row", () => {
		render(
			<FadeInItem>
				<Text>A row</Text>
			</FadeInItem>,
		);
		expect(screen.getByText("A row")).toBeTruthy();
	});

	it("cannot strand a row invisible when the animation never runs", () => {
		// Regression guard. Animated runs on requestAnimationFrame, which browsers
		// pause outright while a tab isn't painting — a fade starting during a
		// pause used to leave the row at opacity 0, which is how a populated list
		// once rendered blank under a "4 Active Posts" heading. The settle timer
		// must force it visible regardless.
		const timing = jest.spyOn(Animated, "timing").mockReturnValue({
			start: () => undefined,
			stop: () => undefined,
			reset: () => undefined,
		} as unknown as Animated.CompositeAnimation);

		try {
			render(
				<FadeInItem index={3}>
					<Text>A row</Text>
				</FadeInItem>,
			);

			act(() => jest.advanceTimersByTime(2000));

			const view = screen.UNSAFE_getByType(Animated.View);
			// The opacity is the animated value itself; read what it settled on.
			expect(view.props.style.opacity.__getValue()).toBe(1);
		} finally {
			timing.mockRestore();
		}
	});

	it("caps the stagger so a long list doesn't out-wait a fast scroll", () => {
		// Row 50 must not wait 50 steps; the delay is capped at MAX_STAGGER.
		const timing = jest.spyOn(Animated, "timing").mockReturnValue({
			start: () => undefined,
			stop: () => undefined,
			reset: () => undefined,
		} as unknown as Animated.CompositeAnimation);

		try {
			render(
				<FadeInItem index={50}>
					<Text>Far down</Text>
				</FadeInItem>,
			);

			// 6 * 55 + 260 + 400 = 990ms is the worst case for any row.
			act(() => jest.advanceTimersByTime(1000));

			const view = screen.UNSAFE_getByType(Animated.View);
			expect(view.props.style.opacity.__getValue()).toBe(1);
		} finally {
			timing.mockRestore();
		}
	});
});
