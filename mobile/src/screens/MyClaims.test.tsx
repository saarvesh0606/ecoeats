import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { addNotificationReceivedListener } from "expo-notifications";
import { RefreshControl } from "react-native";
import { ToastProvider } from "@/components/ui/Toast";
import type { Claim, ClaimedListing } from "@/lib/claims";
import { cancelClaim, fetchMyClaims, rateHost } from "@/lib/claims";
import { MyClaims } from "./MyClaims";

// MyClaims imports ApiError from the API client, which loads Firebase at
// require time. Stub the module, but keep a real ApiError class — the screen
// rethrows anything that isn't one, so an object wouldn't do.
jest.mock("@/lib/api", () => {
	class ApiError extends Error {
		status: number;
		constructor(status = 400, message = "api error") {
			super(message);
			this.status = status;
		}
	}
	return {
		ApiError,
		api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), del: jest.fn() },
	};
});

jest.mock("@/lib/claims", () => ({
	fetchMyClaims: jest.fn(),
	cancelClaim: jest.fn(),
	rateHost: jest.fn(),
}));

jest.mock("expo-router", () => ({
	useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
	// The screen loads through useFocusEffect now. No navigator exists here to
	// hand it focus, so the honest stand-in is the effect it replaced: run on
	// mount, and again if the callback identity changes.
	useFocusEffect: (cb: () => void) => require("react").useEffect(cb, [cb]),
}));

// useRefreshOnPush subscribes for the life of the screen. Keeping the listener
// reachable is the point — firing it is how the "a push refreshes this" test
// reaches the behaviour without a real notification.
jest.mock("expo-notifications", () => ({
	addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Freeze the clock behind the MM:SS countdown. Against a live clock a fixture
// 15m out only reads "15:00" for the first second of the test.
jest.mock("@/hooks/useNow", () => ({
	useNow: () => new Date("2026-08-04T12:00:00Z").getTime(),
}));
const NOW = new Date("2026-08-04T12:00:00Z").getTime();

const mockFetch = fetchMyClaims as jest.MockedFunction<typeof fetchMyClaims>;
const mockCancel = cancelClaim as jest.MockedFunction<typeof cancelClaim>;
const mockRate = rateHost as jest.MockedFunction<typeof rateHost>;

function listing(overrides: Partial<ClaimedListing> = {}): ClaimedListing {
	return {
		id: "l1",
		title: "Leftover pizza",
		allergens: null,
		campus: "Tempe",
		building: "Wrigley Hall",
		room: "205",
		placement_note: null,
		lat: 33.4,
		lng: -111.9,
		expires_at: new Date(NOW + 30 * 60_000).toISOString(),
		photo_urls: [],
		directions_url: "https://maps.example/1",
		...overrides,
	};
}

function claim(overrides: Partial<Claim> = {}): Claim {
	return {
		id: "c1",
		listing_id: "l1",
		recipient_id: "r1",
		recipient_name: "Sam",
		quantity: 1,
		status: "pending",
		claimed_at: new Date(NOW).toISOString(),
		// Fifteen minutes out, so the countdown has something to show.
		reservation_expires_at: new Date(NOW + 15 * 60_000).toISOString(),
		resolved_at: null,
		listing: listing(),
		seconds_to_collect: 900,
		is_rated: false,
		...overrides,
	};
}

function renderClaims() {
	return render(
		<ToastProvider>
			<MyClaims />
		</ToastProvider>,
	);
}

describe("MyClaims", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCancel.mockResolvedValue(claim({ status: "cancelled" }));
		mockRate.mockResolvedValue(undefined as never);
	});

	describe("tab filtering", () => {
		const everything = [
			claim({ id: "c-pending", status: "pending" }),
			claim({ id: "c-picked", status: "picked_up" }),
			claim({ id: "c-noshow", status: "no_show" }),
			claim({ id: "c-cancelled", status: "cancelled" }),
		];

		it("opens on Active, showing only reservations still held", async () => {
			mockFetch.mockResolvedValue(everything);
			renderClaims();
			expect(await screen.findByText("Reserved")).toBeTruthy();
			expect(screen.queryByText("Picked up")).toBeNull();
			expect(screen.queryByText("Cancelled")).toBeNull();
		});

		it("shows collected claims under Picked Up", async () => {
			mockFetch.mockResolvedValue(everything);
			renderClaims();
			await screen.findByText("Reserved");

			fireEvent.press(screen.getByText("Picked Up"));

			expect(screen.getByText("Picked up")).toBeTruthy();
			expect(screen.queryByText("Reserved")).toBeNull();
		});

		it("groups both no-shows and cancellations under Expired", async () => {
			// Two different backend statuses land in one tab; if that mapping breaks,
			// a claim disappears from the UI entirely rather than moving tabs.
			mockFetch.mockResolvedValue(everything);
			renderClaims();
			await screen.findByText("Reserved");

			fireEvent.press(screen.getByText("Expired"));

			// Both rows land here. Count them by their per-row link rather than by
			// status text — "Expired" is also the tab's own label.
			expect(screen.getAllByLabelText(/View details for/)).toHaveLength(2);
			expect(screen.getByText("Cancelled")).toBeTruthy();
			expect(screen.queryByText("Reserved")).toBeNull();
		});
	});

	describe("countdown", () => {
		it("derives MM:SS from the claim's own deadline", async () => {
			mockFetch.mockResolvedValue([claim()]);
			renderClaims();
			expect(await screen.findByText("15:00")).toBeTruthy();
		});

		it("floors at 0:00 rather than counting into negatives", async () => {
			mockFetch.mockResolvedValue([
				claim({ reservation_expires_at: new Date(NOW - 60_000).toISOString() }),
			]);
			renderClaims();
			expect(await screen.findByText("0:00")).toBeTruthy();
		});

		it("shows no countdown once a claim is no longer held", async () => {
			mockFetch.mockResolvedValue([claim({ status: "picked_up" })]);
			renderClaims();
			// Collected claims live on the Picked Up tab, not the default one.
			fireEvent.press(await screen.findByText("Picked Up"));

			expect(screen.getByText("Picked up")).toBeTruthy();
			expect(screen.queryByText("Time remaining")).toBeNull();
		});
	});

	describe("actions", () => {
		it("cancels a reservation and says so", async () => {
			mockFetch.mockResolvedValue([claim()]);
			renderClaims();
			await screen.findByText("Reserved");

			fireEvent.press(screen.getByText("Cancel"));

			await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("c1"));
			expect(await screen.findByText("Claim cancelled.")).toBeTruthy();
		});

		it("offers a rating on a collected claim", async () => {
			mockFetch.mockResolvedValue([claim({ status: "picked_up", is_rated: false })]);
			renderClaims();
			fireEvent.press(await screen.findByText("Picked Up"));

			fireEvent.press(screen.getByLabelText("Rate 5 stars"));

			await waitFor(() => expect(mockRate).toHaveBeenCalledWith("c1", 5));
		});

		it("does not ask twice once the host has been rated", async () => {
			mockFetch.mockResolvedValue([claim({ status: "picked_up", is_rated: true })]);
			renderClaims();
			fireEvent.press(await screen.findByText("Picked Up"));

			expect(screen.queryByLabelText("Rate 5 stars")).toBeNull();
			expect(screen.getByText(/You rated this host/)).toBeTruthy();
		});
	});

	describe("empty states", () => {
		it("invites you to browse when nothing is active", async () => {
			mockFetch.mockResolvedValue([]);
			renderClaims();
			expect(await screen.findByText("No active claims")).toBeTruthy();
			expect(screen.getByText("Browse food")).toBeTruthy();
		});

		it("says something different on the past tabs", async () => {
			mockFetch.mockResolvedValue([]);
			renderClaims();
			await screen.findByText("No active claims");

			fireEvent.press(screen.getByText("Picked Up"));

			expect(screen.getByText("Nothing here yet")).toBeTruthy();
			// Nothing to browse *to* from a history tab.
			expect(screen.queryByText("Browse food")).toBeNull();
		});

		it("stays quiet when the fetch fails", async () => {
			mockFetch.mockRejectedValue(new Error("offline"));
			renderClaims();
			expect(await screen.findByText("No active claims")).toBeTruthy();
		});
	});

	// This screen used to load once and then freeze, while useNow kept the
	// countdown ticking — so a claim the host had already confirmed went on
	// counting down as though it were still waiting to be collected.
	describe("staying current", () => {
		it("reloads when a push arrives, so a confirmed pickup stops counting down", async () => {
			mockFetch.mockResolvedValue([claim({ id: "c-1", status: "pending" })]);
			renderClaims();
			expect(await screen.findByText("Reserved")).toBeTruthy();

			// The host confirms the handover: the server now calls it collected.
			mockFetch.mockResolvedValue([
				claim({ id: "c-1", status: "picked_up" }),
			]);

			const onPush = (addNotificationReceivedListener as jest.Mock).mock
				.calls[0][0];
			await act(async () => {
				onPush();
			});

			await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
			// Gone from Active, and the countdown left with it.
			expect(screen.getByText("No active claims")).toBeTruthy();
		});

		it("reloads when the list is pulled down", async () => {
			mockFetch.mockResolvedValue([claim()]);
			renderClaims();
			await screen.findByText("Reserved");

			await act(async () => {
				screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
			});

			await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
		});
	});
});
