import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AppNotification } from "@/lib/notifications";
import {
	deleteNotification,
	fetchNotifications,
	markNotificationsRead,
} from "@/lib/notifications";
import { ToastProvider } from "@/components/ui/Toast";
import { NotificationsList } from "./NotificationsList";

jest.mock("@/lib/api", () => jest.requireActual("@/test-utils/render").apiModuleMock());

// The network calls are stubbed, but listingRouteFor stays real — it decides
// which screen a tap opens, and a hand-written copy here would pass while the
// app sent hosts to the wrong place.
jest.mock("@/lib/notifications", () => ({
	...jest.requireActual("@/lib/notifications"),
	fetchNotifications: jest.fn(),
	markNotificationsRead: jest.fn(),
	deleteNotification: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

let mockRole: "organizer" | "recipient" = "recipient";
jest.mock("@/context/AuthContext", () => ({
	useAuth: () => ({ profile: { role: mockRole } }),
}));

const mockFetch = fetchNotifications as jest.MockedFunction<typeof fetchNotifications>;
const mockRead = markNotificationsRead as jest.MockedFunction<typeof markNotificationsRead>;
const mockDelete = deleteNotification as jest.MockedFunction<typeof deleteNotification>;

function note(overrides: Partial<AppNotification> = {}): AppNotification {
	return {
		id: "n1",
		message: "Sam claimed Leftover pizza",
		kind: "claim",
		listing_id: null,
		listing_title: null,
		listing_photo_url: null,
		read: false,
		created_at: new Date().toISOString(),
		...overrides,
	};
}

/**
 * Timestamps anchored to the start of today, not to "N hours ago".
 *
 * The buckets are calendar days, so a relative offset lands in a different one
 * depending on the time of day the suite runs: at 00:30, "one hour ago" is
 * yesterday. These tests failed exactly once, at midnight, for that reason.
 */
function startOfToday(): number {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

function minutesIntoToday(m: number): string {
	return new Date(startOfToday() + m * 60_000).toISOString();
}

function daysBeforeToday(days: number): string {
	// Mid-morning on that day, so nothing sits on a boundary.
	return new Date(startOfToday() - days * 86_400_000 + 10 * 3_600_000).toISOString();
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
		mockRole = "recipient";
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

	describe("what a row shows", () => {
		it("shows the food the notification is about", async () => {
			mockFetch.mockResolvedValue({
				items: [
					note({
						listing_id: "l1",
						listing_title: "Leftover pizza",
						listing_photo_url: "https://cdn.test/pizza.jpg",
					}),
				],
				unread_count: 0,
			});
			renderList();

			// The message alone never said which post it was about.
			expect(await screen.findByText("Leftover pizza")).toBeTruthy();
		});

		it("renders a listing that has no photo", async () => {
			// Most posts have none, and the row still has to draw.
			mockFetch.mockResolvedValue({
				items: [note({ listing_title: "Leftover pizza" })],
				unread_count: 0,
			});
			renderList();

			expect(await screen.findByText("Leftover pizza")).toBeTruthy();
		});

		it("survives a kind it has never heard of", async () => {
			// A server that grows a new event type must not blank the screen.
			mockFetch.mockResolvedValue({
				items: [
					note({
						kind: "something-new" as AppNotification["kind"],
						message: "Something new happened",
					}),
				],
				unread_count: 0,
			});
			renderList();

			expect(await screen.findByText("Something new happened")).toBeTruthy();
		});
	});

	describe("day sections", () => {
		it("separates today from yesterday and earlier", async () => {
			mockFetch.mockResolvedValue({
				items: [
					note({ id: "a", message: "From today", created_at: minutesIntoToday(1) }),
					note({ id: "b", message: "From yesterday", created_at: daysBeforeToday(1) }),
					note({ id: "c", message: "From last week", created_at: daysBeforeToday(8) }),
				],
				unread_count: 0,
			});
			renderList();

			await screen.findByText("From today");
			expect(screen.getByText("Today")).toBeTruthy();
			expect(screen.getByText("Yesterday")).toBeTruthy();
			expect(screen.getByText("Earlier")).toBeTruthy();
		});

		it("shows only the sections it has anything for", async () => {
			mockFetch.mockResolvedValue({
				items: [note({ message: "From today", created_at: minutesIntoToday(2) })],
				unread_count: 0,
			});
			renderList();

			await screen.findByText("From today");
			expect(screen.getByText("Today")).toBeTruthy();
			expect(screen.queryByText("Yesterday")).toBeNull();
			expect(screen.queryByText("Earlier")).toBeNull();
		});
	});

	describe("where a tap goes", () => {
		const tappable = note({
			message: "Sam claimed Leftover pizza",
			listing_id: "l9",
			listing_title: "Leftover pizza",
		});

		it("sends a recipient to the listing they could claim", async () => {
			mockRole = "recipient";
			mockFetch.mockResolvedValue({ items: [tappable], unread_count: 0 });
			renderList();

			fireEvent.press(await screen.findByLabelText(tappable.message));

			expect(mockPush).toHaveBeenCalledWith("/listing/l9");
		});

		it("sends a host to the screen that manages their own post", async () => {
			// A host's notifications are about food they posted. The listing screen
			// offered them the chance to reserve their own food, which is nonsense.
			mockRole = "organizer";
			mockFetch.mockResolvedValue({ items: [tappable], unread_count: 0 });
			renderList();

			fireEvent.press(await screen.findByLabelText(tappable.message));

			expect(mockPush).toHaveBeenCalledWith("/manage/l9");
		});
	});
});
