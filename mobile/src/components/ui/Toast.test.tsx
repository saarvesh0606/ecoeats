import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Animated, Pressable } from "react-native";
import { ToastProvider, useToast } from "./Toast";

/** Mirrors VISIBLE_MS in Toast.tsx. */
const VISIBLE_MS = 2200;
/** Mirrors the unmount fallback that runs after the exit animation. */
const CLEAR_MS = 400;

function Harness({ message }: { message: string }) {
	const { show } = useToast();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`show ${message}`}
			onPress={() => show(message)}
		/>
	);
}

function renderToast(messages: string[] = ["Saved"]) {
	return render(
		<ToastProvider>
			{messages.map((m) => (
				<Harness key={m} message={m} />
			))}
		</ToastProvider>,
	);
}

describe("ToastProvider", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		act(() => jest.runOnlyPendingTimers());
		jest.useRealTimers();
	});

	it("shows nothing until something asks it to", () => {
		renderToast();
		expect(screen.queryByText("Saved")).toBeNull();
	});

	it("shows the message it was given", () => {
		renderToast();
		fireEvent.press(screen.getByLabelText("show Saved"));
		expect(screen.getByText("Saved")).toBeTruthy();
	});

	it("takes itself away once the visible window has passed", () => {
		renderToast();
		fireEvent.press(screen.getByLabelText("show Saved"));

		act(() => jest.advanceTimersByTime(VISIBLE_MS - 100));
		expect(screen.queryByText("Saved")).toBeTruthy();

		act(() => jest.advanceTimersByTime(100 + CLEAR_MS + 50));
		expect(screen.queryByText("Saved")).toBeNull();
	});

	it("restarts the countdown when a second message arrives", () => {
		renderToast(["Saved", "Deleted"]);
		fireEvent.press(screen.getByLabelText("show Saved"));

		// Most of the way through the first message's window.
		act(() => jest.advanceTimersByTime(VISIBLE_MS - 200));
		fireEvent.press(screen.getByLabelText("show Deleted"));
		expect(screen.getByText("Deleted")).toBeTruthy();

		// The first message's original deadline passes; the second must survive it,
		// otherwise the banner would vanish almost as soon as it appeared.
		act(() => jest.advanceTimersByTime(400));
		expect(screen.getByText("Deleted")).toBeTruthy();

		act(() => jest.advanceTimersByTime(VISIBLE_MS + CLEAR_MS));
		expect(screen.queryByText("Deleted")).toBeNull();
	});

	it("still unmounts when the exit animation never finishes", () => {
		// Regression guard. The message used to be cleared *only* from the
		// fade-out's completion callback, so an exit animation that never ran left
		// the banner on screen for good. Simulate exactly that: an animation whose
		// start() never calls back.
		const timing = jest.spyOn(Animated, "timing").mockReturnValue({
			start: () => undefined,
			stop: () => undefined,
			reset: () => undefined,
		} as unknown as Animated.CompositeAnimation);

		try {
			renderToast();
			fireEvent.press(screen.getByLabelText("show Saved"));
			expect(screen.getByText("Saved")).toBeTruthy();

			act(() => jest.advanceTimersByTime(VISIBLE_MS + CLEAR_MS + 50));
			expect(screen.queryByText("Saved")).toBeNull();
		} finally {
			timing.mockRestore();
		}
	});
});
