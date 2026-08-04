import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SwipeableRow } from "./SwipeableRow";

// Note: the pan-responder thresholds (CLAIM_SLOP, OPEN_THRESHOLD) aren't
// exercised here. Driving a real gesture would mean fabricating RN's internal
// touch history, which tests the framework more than this component. What is
// worth pinning is the contract the rest of the app relies on: the destructive
// action is reachable, labelled, and never fires on its own.

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
});
