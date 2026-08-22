import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SWIPE_POLICY, SwipeableRow } from "./SwipeableRow";

// Driving a real gesture would mean fabricating RN's internal touch history,
// which tests the framework more than this component. So the rendering tests
// pin the contract the rest of the app relies on — the destructive action is
// reachable, labelled, and never fires on its own — and the gesture rules are
// tested directly as the pure functions they are.

describe("SwipeableRow", () => {
	it("renders the row's own content", () => {
		render(
			<SwipeableRow onDelete={() => {}}>
				<Text>A notification</Text>
			</SwipeableRow>,
		);
		expect(screen.getByText("A notification")).toBeTruthy();
	});

	it("does not delete just because the row was rendered", () => {
		// Deleting is deliberately two steps — swipe to reveal, tap to commit.
		// Nothing about mounting or sliding may commit it on its own.
		const onDelete = jest.fn();
		render(
			<SwipeableRow onDelete={onDelete}>
				<Text>A notification</Text>
			</SwipeableRow>,
		);
		expect(onDelete).not.toHaveBeenCalled();
	});

	it("commits the delete when the revealed action is tapped", () => {
		const onDelete = jest.fn();
		render(
			<SwipeableRow onDelete={onDelete}>
				<Text>A notification</Text>
			</SwipeableRow>,
		);
		fireEvent.press(screen.getByLabelText("Delete"));
		expect(onDelete).toHaveBeenCalledTimes(1);
	});

	it("lets the caller name the action", () => {
		render(
			<SwipeableRow onDelete={() => {}} deleteLabel="Remove">
				<Text>A notification</Text>
			</SwipeableRow>,
		);
		expect(screen.getByLabelText("Remove")).toBeTruthy();
	});

	describe("gesture rules", () => {
		it("never hands the gesture back to the scroller", () => {
			// ⚠️ PanResponder defaults this to TRUE. A scrolling FlatList asks for
			// the gesture back as soon as a drag picks up any vertical component,
			// and granting it terminated the pan mid-swipe — rows snapped shut
			// under the user's finger for no visible reason. If this ever goes
			// back to true, that returns.
			expect(SWIPE_POLICY.yieldToScroller).toBe(false);
		});

		it("ignores drags too small to be deliberate", () => {
			expect(SWIPE_POLICY.claims(-4, 0, false)).toBe(false);
		});

		it("leaves vertical drags to the list", () => {
			// Scrolling a feed wanders sideways; the list has to keep those.
			expect(SWIPE_POLICY.claims(-14, -40, false)).toBe(false);
		});

		it("claims a clearly horizontal drag", () => {
			expect(SWIPE_POLICY.claims(-20, 4, false)).toBe(true);
		});

		it("opens leftwards and closes rightwards, never the reverse", () => {
			// Closed: only a leftward pull may open it.
			expect(SWIPE_POLICY.claims(-20, 0, false)).toBe(true);
			expect(SWIPE_POLICY.claims(20, 0, false)).toBe(false);
			// Open: only a rightward pull may close it.
			expect(SWIPE_POLICY.claims(20, 0, true)).toBe(true);
			expect(SWIPE_POLICY.claims(-20, 0, true)).toBe(false);
		});

		it("holds the row between closed and fully revealed", () => {
			// Dragging past the action must not tear the row off the screen.
			expect(SWIPE_POLICY.clamp(-500)).toBe(-88);
			expect(SWIPE_POLICY.clamp(40)).toBe(0);
			expect(SWIPE_POLICY.clamp(-30)).toBe(-30);
		});

		it("stays open only past the threshold", () => {
			expect(SWIPE_POLICY.opensOnRelease(-10)).toBe(false);
			expect(SWIPE_POLICY.opensOnRelease(-80)).toBe(true);
		});
	});
});
