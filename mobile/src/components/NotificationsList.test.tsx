import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AppNotification } from "@/lib/notifications";
import {
	deleteNotification,
	fetchNotifications,
	markNotificationsRead,
} from "@/lib/notifications";
import { ToastProvider } from "@/components/ui/Toast";
import { NotificationsList } from "./NotificationsList";

jest.mock("@/lib/notifications", () => ({
	fetchNotifications: jest.fn(),
	markNotificationsRead: jest.fn(),
	deleteNotification: jest.fn(),
}));

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockFetch = fetchNotifications as jest.MockedFunction<typeof fetchNotifications>;
const mockRead = markNotificationsRead as jest.MockedFunction<typeof markNotificationsRead>;
const mockDelete = deleteNotification as jest.MockedFunction<typeof deleteNotification>;

function note(overrides: Partial<AppNotification> = {}): AppNotification {
	return {
		id: "n1",
		message: "Sam claimed Leftover pizza",
		listing_id: null,
		read: false,
		created_at: new Date().toISOString(),
		...overrides,
	};
}

function renderList() {
	return render(
		<ToastProvider>
			<NotificationsList />
		</ToastProvider>,
	);
}

describe("NotificationsList", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockRead.mockResolvedValue(undefined);
		mockDelete.mockResolvedValue(undefined);
	});

	it("shows the notifications it loaded", async () => {
		mockFetch.mockResolvedValue({ items: [note()], unread_count: 1 });
		renderList();
		expect(await screen.findByText("Sam claimed Leftover pizza")).toBeTruthy();
	});

	it("marks everything read once the list is opened", async () => {
		mockFetch.mockResolvedValue({ items: [note()], unread_count: 1 });
		renderList();
		await screen.findByText("Sam claimed Leftover pizza");
		await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(1));
	});

	it("doesn't bother marking read when nothing is unread", async () => {
		mockFetch.mockResolvedValue({ items: [note({ read: true })], unread_count: 0 });
		renderList();
		await screen.findByText("Sam claimed Leftover pizza");
		expect(mockRead).not.toHaveBeenCalled();
	});

	it("shows the empty state when there is nothing to report", async () => {
		mockFetch.mockResolvedValue({ items: [], unread_count: 0 });
		renderList();
		expect(await screen.findByText("You're all caught up")).toBeTruthy();
	});

	it("keeps the list intact when loading fails", async () => {
		// A transient failure should leave a quiet empty list, not crash the tab.
		mockFetch.mockRejectedValue(new Error("offline"));
		renderList();
		expect(await screen.findByText("You're all caught up")).toBeTruthy();
	});

	it("removes a notification straight away, without waiting on the server", async () => {
		mockFetch.mockResolvedValue({ items: [note()], unread_count: 0 });
		// A delete that never settles: the row must still disappear immediately,
		// otherwise the tap feels broken.
		mockDelete.mockReturnValue(new Promise<void>(() => {}));

		renderList();
		await screen.findByText("Sam claimed Leftover pizza");

		fireEvent.press(screen.getByLabelText("Delete"));

		await waitFor(() =>
			expect(screen.queryByText("Sam claimed Leftover pizza")).toBeNull(),
		);
		expect(mockDelete).toHaveBeenCalledWith("n1");
	});

	it("puts the notification back if the server rejects the delete", async () => {
		mockFetch.mockResolvedValue({ items: [note()], unread_count: 0 });
		mockDelete.mockRejectedValue(new Error("404"));

		renderList();
		await screen.findByText("Sam claimed Leftover pizza");

		fireEvent.press(screen.getByLabelText("Delete"));

		// Restored, and the user is told why it came back.
		expect(await screen.findByText("Sam claimed Leftover pizza")).toBeTruthy();
		expect(await screen.findByText("Couldn't delete that. Try again.")).toBeTruthy();
	});

	it("restores into date order rather than at the end of the list", async () => {
		const older = note({
			id: "n1",
			message: "Older one",
			created_at: "2026-08-01T10:00:00Z",
		});
		const newer = note({
			id: "n2",
			message: "Newer one",
			created_at: "2026-08-02T10:00:00Z",
		});
		mockFetch.mockResolvedValue({ items: [newer, older], unread_count: 0 });
		mockDelete.mockRejectedValue(new Error("404"));

		renderList();
		await screen.findByText("Newer one");

		// Delete the newer (first) row; when it fails it must come back on top.
		fireEvent.press(screen.getAllByLabelText("Delete")[0]);
		await screen.findByText("Couldn't delete that. Try again.");

		const messages = screen
			.getAllByText(/one$/)
			.map((n) => n.props.children as string);
		expect(messages).toEqual(["Newer one", "Older one"]);
	});
});
