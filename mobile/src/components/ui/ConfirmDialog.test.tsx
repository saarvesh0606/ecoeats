import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Modal, Pressable } from "react-native";
import { ConfirmProvider, useConfirm } from "./ConfirmDialog";

function Harness({ onResult }: { onResult: (accepted: boolean) => void }) {
	const confirm = useConfirm();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel="ask"
			onPress={async () => {
				onResult(
					await confirm({
						title: "End this post?",
						message: "It disappears for everyone immediately.",
						confirmLabel: "End post",
					}),
				);
			}}
		/>
	);
}

function renderConfirm() {
	const onResult = jest.fn();
	render(
		<ConfirmProvider>
			<Harness onResult={onResult} />
		</ConfirmProvider>,
	);
	return { onResult, ask: () => fireEvent.press(screen.getByLabelText("ask")) };
}

describe("ConfirmProvider", () => {
	it("shows the caller's words, not a generic prompt", () => {
		const { ask } = renderConfirm();
		ask();
		expect(screen.getByText("End this post?")).toBeTruthy();
		expect(
			screen.getByText("It disappears for everyone immediately."),
		).toBeTruthy();
		expect(screen.getByText("End post")).toBeTruthy();
	});

	it("resolves true when the action is confirmed", async () => {
		const { ask, onResult } = renderConfirm();
		ask();
		fireEvent.press(screen.getByText("End post"));
		await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
	});

	it("resolves false when cancelled", async () => {
		const { ask, onResult } = renderConfirm();
		ask();
		fireEvent.press(screen.getByText("Cancel"));
		await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
	});

	it("resolves false when Android back dismisses it", async () => {
		// The hardware back button must settle the promise. Hiding the dialog
		// without resolving would leave `await confirm(...)` hanging forever, and
		// the caller would silently never continue.
		const { ask, onResult } = renderConfirm();
		ask();

		const modal = screen.UNSAFE_getByType(Modal);
		fireEvent(modal, "requestClose");

		await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
	});

	it("settles exactly once even if dismissed twice", async () => {
		const { ask, onResult } = renderConfirm();
		ask();

		fireEvent.press(screen.getByText("Cancel"));
		const modal = screen.UNSAFE_getByType(Modal);
		fireEvent(modal, "requestClose");

		await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
		expect(onResult).toHaveBeenCalledWith(false);
	});

	it("can be asked again after being answered", async () => {
		const { ask, onResult } = renderConfirm();

		ask();
		fireEvent.press(screen.getByText("Cancel"));
		await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));

		ask();
		fireEvent.press(screen.getByText("End post"));
		await waitFor(() => expect(onResult).toHaveBeenCalledTimes(2));
		expect(onResult).toHaveBeenLastCalledWith(true);
	});
});
