import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { ToastProvider } from "@/components/ui/Toast";
import { fetchListing, type Listing } from "@/lib/listings";
import { blockUser, reportListing } from "@/lib/moderation";
import ListingDetailScreen from "../../app/(app)/listing/[id]";

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

jest.mock("@/lib/listings", () => ({ fetchListing: jest.fn() }));
jest.mock("@/lib/claims", () => ({ createClaim: jest.fn() }));

// The reason list is real — it drives the sheet's rows, and mocking it away
// would leave nothing to press.
jest.mock("@/lib/moderation", () => ({
	...jest.requireActual("@/lib/moderation"),
	reportListing: jest.fn(),
	blockUser: jest.fn(),
}));

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

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
	useLocalSearchParams: () => ({ id: "l1" }),
	useRouter: () => ({ replace: jest.fn(), back: mockBack, push: jest.fn() }),
}));

const NOW = new Date("2026-08-04T12:00:00Z").getTime();
jest.mock("@/hooks/useNow", () => ({
	useNow: () => new Date("2026-08-04T12:00:00Z").getTime(),
}));

const mockFetch = fetchListing as jest.MockedFunction<typeof fetchListing>;
const mockReport = reportListing as jest.MockedFunction<typeof reportListing>;
const mockBlock = blockUser as jest.MockedFunction<typeof blockUser>;

function listing(): Listing {
	return {
		id: "l1",
		title: "Leftover pizza",
		description: "Cheese and pepperoni",
		allergens: null,
		dietary_tags: [],
		quantity_total: 10,
		quantity_remaining: 4,
		campus: "Tempe",
		building: "Wrigley Hall",
		room: "205",
		placement_note: null,
		lat: 33.4,
		lng: -111.9,
		expires_at: new Date(NOW + 52 * 60_000).toISOString(),
		status: "active",
		created_at: new Date(NOW).toISOString(),
		scheduled_for: null,
		organizer: { id: "o1", name: "Front Desk", rating: null, rating_count: 0 },
		photo_urls: [],
		distance_miles: null,
		seconds_remaining: 3120,
		is_claimable: true,
		is_saved: false,
		interested_count: 0,
	};
}

const METRICS = {
	frame: { x: 0, y: 0, width: 390, height: 844 },
	insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderDetail() {
	return render(
		<SafeAreaProvider initialMetrics={METRICS}>
			<ToastProvider>
				<ConfirmProvider>
					<ListingDetailScreen />
				</ConfirmProvider>
			</ToastProvider>
		</SafeAreaProvider>,
	);
}

/** Wait for the listing to land, so the host block and its actions exist. */
async function loaded() {
	renderDetail();
	await waitFor(() => expect(screen.getByText("Front Desk")).toBeTruthy());
}

describe("reporting a listing", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFetch.mockResolvedValue(listing());
		mockReport.mockResolvedValue(undefined);
		mockBlock.mockResolvedValue(undefined);
	});

	it("offers a way to report, because carrying other people's content requires one", async () => {
		await loaded();

		expect(screen.getByText("Report this listing")).toBeTruthy();
	});

	it("sends the chosen reason", async () => {
		await loaded();

		fireEvent.press(screen.getByText("Report this listing"));
		fireEvent.press(screen.getByText("Unsafe or wrongly described food"));
		fireEvent.press(screen.getByText("Send report"));

		await waitFor(() =>
			expect(mockReport).toHaveBeenCalledWith("l1", "unsafe_food", ""),
		);
	});

	it("passes the reporter's own words through", async () => {
		await loaded();

		fireEvent.press(screen.getByText("Report this listing"));
		fireEvent.press(screen.getByText("Misleading or not really available"));
		fireEvent.changeText(
			screen.getByPlaceholderText("e.g. the food was gone when I arrived"),
			"Nothing was there",
		);
		fireEvent.press(screen.getByText("Send report"));

		await waitFor(() =>
			expect(mockReport).toHaveBeenCalledWith(
				"l1",
				"misleading",
				"Nothing was there",
			),
		);
	});

	it("will not send 'something else' with no words", async () => {
		// The server rejects it, and a report nobody can act on is not worth a
		// round trip — so the button waits rather than the network failing.
		await loaded();

		fireEvent.press(screen.getByText("Report this listing"));
		fireEvent.press(screen.getByText("Something else"));
		fireEvent.press(screen.getByText("Send report"));

		expect(mockReport).not.toHaveBeenCalled();
	});

	it("says received, and nothing about what happens next", async () => {
		// Confirming that the listing came down would make reporting a way to
		// probe other people's accounts.
		await loaded();

		fireEvent.press(screen.getByText("Report this listing"));
		fireEvent.press(screen.getByText("Spam or selling"));
		fireEvent.press(screen.getByText("Send report"));

		expect(await screen.findByText(/we'll take a look/)).toBeTruthy();
	});

	it("keeps the sheet open when the report fails", async () => {
		mockReport.mockRejectedValue(new Error("offline"));
		await loaded();

		fireEvent.press(screen.getByText("Report this listing"));
		fireEvent.press(screen.getByText("Harassment"));
		fireEvent.press(screen.getByText("Send report"));

		expect(await screen.findByText(/Couldn't send that report/)).toBeTruthy();
		// Still there to retry, rather than having silently dropped the report.
		expect(screen.getByText("Send report")).toBeTruthy();
	});
});

describe("blocking a host", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFetch.mockResolvedValue(listing());
		mockBlock.mockResolvedValue(undefined);
	});

	it("offers a way to block", async () => {
		await loaded();

		expect(screen.getByText("Block this host")).toBeTruthy();
	});

	it("asks first, and does nothing if declined", async () => {
		await loaded();

		fireEvent.press(screen.getByText("Block this host"));
		expect(await screen.findByText("Block Front Desk?")).toBeTruthy();

		fireEvent.press(screen.getByText("Cancel"));

		await waitFor(() => expect(mockBlock).not.toHaveBeenCalled());
	});

	it("blocks the organizer, not the listing", async () => {
		await loaded();

		fireEvent.press(screen.getByText("Block this host"));
		fireEvent.press(await screen.findByText("Block"));

		await waitFor(() => expect(mockBlock).toHaveBeenCalledWith("o1"));
	});

	it("leaves the page, because the listing is now hidden from them", async () => {
		// Staying on a page that no longer exists for this account is a dead end.
		await loaded();

		fireEvent.press(screen.getByText("Block this host"));
		fireEvent.press(await screen.findByText("Block"));

		await waitFor(() => expect(mockBack).toHaveBeenCalled());
	});

	it("stays put when the block fails", async () => {
		mockBlock.mockRejectedValue(new Error("offline"));
		await loaded();

		fireEvent.press(screen.getByText("Block this host"));
		fireEvent.press(await screen.findByText("Block"));

		expect(await screen.findByText(/Couldn't block that account/)).toBeTruthy();
		expect(mockBack).not.toHaveBeenCalled();
	});
});
