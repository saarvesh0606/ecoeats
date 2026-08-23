import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { usePushNavigation } from "./usePushNavigation";

// Stops the import chain at the API client: notifications → api → firebase →
// AsyncStorage, whose native module doesn't exist under Jest. listingRouteFor
// stays real, since which screen a push opens is the point of these tests.
jest.mock("@/lib/api", () =>
	jest.requireActual("@/test-utils/render").apiModuleMock(),
);

const removeReceived = jest.fn();
const removeResponse = jest.fn();
let onReceived: (() => void) | null = null;
let onResponse: ((r: unknown) => void) | null = null;

jest.mock("expo-notifications", () => ({
	setNotificationHandler: jest.fn(),
	addNotificationReceivedListener: jest.fn(),
	addNotificationResponseReceivedListener: jest.fn(),
	getLastNotificationResponseAsync: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

let mockRole: "organizer" | "recipient" = "recipient";
jest.mock("@/context/AuthContext", () => ({
	useAuth: () => ({ profile: { role: mockRole } }),
}));

const mockRefresh = jest.fn(async () => {});
jest.mock("@/context/UnreadContext", () => ({
	useUnread: () => ({ refresh: mockRefresh }),
}));

const notifications = Notifications as jest.Mocked<typeof Notifications>;

describe("usePushNavigation", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockRole = "recipient";
		onReceived = null;
		onResponse = null;

		(
			notifications.addNotificationReceivedListener as unknown as jest.Mock
		).mockImplementation((cb: () => void) => {
			onReceived = cb;
			return { remove: removeReceived };
		});
		(
			notifications.addNotificationResponseReceivedListener as unknown as jest.Mock
		).mockImplementation((cb: (r: unknown) => void) => {
			onResponse = cb;
			return { remove: removeResponse };
		});
		(
			notifications.getLastNotificationResponseAsync as unknown as jest.Mock
		).mockResolvedValue(null);
	});

	it("refreshes the unread count when a push arrives", async () => {
		// The only live signal that the count moved. Without it the dot appeared
		// only after backgrounding and returning, which is when the count last
		// refreshed on its own.
		renderHook(() => usePushNavigation());

		act(() => onReceived?.());

		await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
	});

	it("opens the listing a tapped push points at", async () => {
		renderHook(() => usePushNavigation());

		act(() =>
			onResponse?.({
				notification: { request: { content: { data: { listingId: "l7" } } } },
			}),
		);

		expect(mockPush).toHaveBeenCalledWith("/listing/l7");
	});

	it("sends a host to the screen that manages their own post", async () => {
		mockRole = "organizer";
		renderHook(() => usePushNavigation());

		act(() =>
			onResponse?.({
				notification: { request: { content: { data: { listingId: "l7" } } } },
			}),
		);

		expect(mockPush).toHaveBeenCalledWith("/manage/l7");
	});

	it("ignores a push that names no listing", () => {
		renderHook(() => usePushNavigation());

		act(() => onResponse?.({ notification: { request: { content: {} } } }));

		expect(mockPush).not.toHaveBeenCalled();
	});

	it("lets go of both listeners on unmount", () => {
		// Two subscriptions now, and the second was easy to forget.
		const { unmount } = renderHook(() => usePushNavigation());
		unmount();

		expect(removeResponse).toHaveBeenCalled();
		expect(removeReceived).toHaveBeenCalled();
	});
});
