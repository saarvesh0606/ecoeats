import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { RefreshControl } from "react-native";
import { fetchFeed } from "@/lib/listings";
import type { ListingStreamEvent } from "@/lib/listingStream";
import { subscribeToListings } from "@/lib/listingStream";
import { makeListing, NOW } from "@/test-utils/fixtures";
import { RecipientFeed } from "./RecipientFeed";

jest.mock("@/lib/api", () => jest.requireActual("@/test-utils/render").apiModuleMock());
jest.mock("@/lib/listings", () => ({
	DIETARY_TAGS: ["vegetarian", "vegan", "halal", "kosher", "gluten-free"],
	fetchFeed: jest.fn(),
	// ListingCard reaches for these; the bookmark isn't what's under test here.
	saveListing: jest.fn(),
	unsaveListing: jest.fn(),
}));
jest.mock("@/lib/listingStream", () => ({ subscribeToListings: jest.fn() }));

// The feed reads dietary preferences off the profile to mark matching tags.
// Stubbed rather than provided, because the real context reaches for
// AsyncStorage, which has no native module under Jest.
const mockPrefs: string[] = [];
jest.mock("@/context/AuthContext", () => ({
	useAuth: () => ({ profile: { dietary_prefs: mockPrefs } }),
}));

// Denied by default. The feed has to be fully usable without a location, so
// that is the state most of this suite should be exercising.
const mockRequestLocation = jest.fn(async () => null as unknown);
jest.mock("@/hooks/useDeviceLocation", () => ({
	useDeviceLocation: () => mockUseDeviceLocation(),
}));
const mockUseDeviceLocation = jest.fn(() => ({
	coords: null as { lat: number; lng: number } | null,
	status: "denied",
	request: mockRequestLocation,
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/hooks/useNow", () => ({
	useNow: () => new Date("2026-08-04T12:00:00Z").getTime(),
}));

const mockFeed = fetchFeed as jest.MockedFunction<typeof fetchFeed>;
const mockSubscribe = subscribeToListings as jest.MockedFunction<
	typeof subscribeToListings
>;

/** Fires an SSE event through whatever handler the screen registered. */
let emit: (event: ListingStreamEvent) => void = () => {};

function streamEvent(overrides: Partial<ListingStreamEvent> = {}): ListingStreamEvent {
	return {
		listing_id: "l1",
		quantity_remaining: 3,
		status: "active",
		expires_at: new Date(NOW + 30 * 60_000).toISOString(),
		...overrides,
	};
}

describe("RecipientFeed", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		// clearAllMocks resets calls, not return values, so a test that grants
		// location would otherwise leak coordinates into every test after it.
		mockUseDeviceLocation.mockReturnValue({
			coords: null,
			status: "denied",
			request: mockRequestLocation,
		});
		mockFeed.mockResolvedValue({ items: [makeListing()], nextCursor: null });
		mockSubscribe.mockImplementation(async (cb) => {
			emit = cb;
			return () => {};
		});
	});

	it("shows the listings it loaded", async () => {
		expect(await renderFeed()).toBeTruthy();
		expect(screen.getByText("Leftover pizza")).toBeTruthy();
	});

	async function renderFeed() {
		render(<RecipientFeed />);
		return await screen.findByText("Discover");
	}

	describe("location", () => {
		it("asks the server for distances once it knows where you are", async () => {
			mockUseDeviceLocation.mockReturnValue({
				coords: { lat: 33.4212, lng: -111.9327 },
				status: "granted",
				request: mockRequestLocation,
			});

			render(<RecipientFeed />);

			await waitFor(() =>
				expect(mockFeed).toHaveBeenCalledWith(
					expect.objectContaining({ lat: 33.4212, lng: -111.9327 }),
				),
			);
		});

		it("still lists food when location is refused, just without distances", async () => {
			// Location is an enhancement, never a gate. A refused permission must
			// not cost the user the feed itself.
			mockUseDeviceLocation.mockReturnValue({
				coords: null,
				status: "denied",
				request: mockRequestLocation,
			});

			render(<RecipientFeed />);

			expect(await screen.findByText("Leftover pizza")).toBeTruthy();
			expect(mockFeed).toHaveBeenCalledWith(
				expect.objectContaining({ lat: undefined, lng: undefined }),
			);
		});
	});

	describe("search", () => {
		it("waits for a pause before asking the server", async () => {
			await renderFeed();
			expect(mockFeed).toHaveBeenCalledTimes(1);

			fireEvent.changeText(
				screen.getByPlaceholderText("Search food, meals, or locations"),
				"pizza",
			);

			// Not on the keystroke — that would be one request per character.
			expect(mockFeed).toHaveBeenCalledTimes(1);

			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ q: "pizza" }),
				),
			);
		});

		it("searches server-side, trimmed", async () => {
			await renderFeed();
			fireEvent.changeText(
				screen.getByPlaceholderText("Search food, meals, or locations"),
				"  pizza  ",
			);
			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ q: "pizza" }),
				),
			);
		});

		it("offers a way to clear the box", async () => {
			await renderFeed();
			const box = screen.getByPlaceholderText("Search food, meals, or locations");
			fireEvent.changeText(box, "pizza");

			fireEvent.press(await screen.findByLabelText("Clear search"));

			expect(box.props.value).toBe("");
		});

		it("says what it searched for when nothing matched", async () => {
			await renderFeed();
			mockFeed.mockResolvedValue({ items: [], nextCursor: null });
			fireEvent.changeText(
				screen.getByPlaceholderText("Search food, meals, or locations"),
				"sushi",
			);

			expect(await screen.findByText('No matches for "sushi"')).toBeTruthy();
			expect(screen.getByText("Try a different search.")).toBeTruthy();
		});
	});

	describe("filters", () => {
		it("asks for expiring-soon food only", async () => {
			await renderFeed();
			fireEvent.press(screen.getByText("Expiring soon"));

			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ maxMinutes: 20 }),
				),
			);
		});

		it("sends the dietary tags it was given", async () => {
			await renderFeed();
			fireEvent.press(screen.getByText("vegetarian"));

			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ dietary: ["vegetarian"] }),
				),
			);
		});

		it("stacks more than one tag", async () => {
			await renderFeed();
			fireEvent.press(screen.getByText("vegetarian"));
			fireEvent.press(screen.getByText("vegan"));

			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ dietary: ["vegetarian", "vegan"] }),
				),
			);
		});

		it("clears everything with All", async () => {
			await renderFeed();
			fireEvent.press(screen.getByText("vegetarian"));
			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ dietary: ["vegetarian"] }),
				),
			);

			fireEvent.press(screen.getByText("All"));

			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ dietary: undefined, maxMinutes: undefined }),
				),
			);
		});

		it("offers to clear filters when they hid everything", async () => {
			await renderFeed();
			mockFeed.mockResolvedValue({ items: [], nextCursor: null });
			fireEvent.press(screen.getByText("vegan"));

			expect(await screen.findByText("Nothing matches those filters")).toBeTruthy();
			expect(screen.getByText("Clear filters")).toBeTruthy();
		});
	});

	describe("filter sheet", () => {
		const AT_TEMPE = { lat: 33.4212, lng: -111.9327 };

		function grantLocation() {
			mockUseDeviceLocation.mockReturnValue({
				coords: AT_TEMPE,
				status: "granted",
				request: mockRequestLocation,
			});
		}

		async function openSheet() {
			fireEvent.press(screen.getByLabelText(/^Filters/));
			return await screen.findByText("Expiring within");
		}

		it("opens from the icon in the search bar", async () => {
			await renderFeed();
			expect(await openSheet()).toBeTruthy();
		});

		it("sets a tighter window than the chip offers", async () => {
			// The chip is a single fixed 20 minutes; this is the point of the sheet.
			await renderFeed();
			await openSheet();

			fireEvent.press(screen.getByText("15m"));

			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ maxMinutes: 15 }),
				),
			);
		});

		it("filters by distance once it knows where you are", async () => {
			grantLocation();
			render(<RecipientFeed />);
			await screen.findByText("Discover");
			await openSheet();

			fireEvent.press(screen.getByText("0.5 mi"));

			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ radiusMiles: 0.5, ...AT_TEMPE }),
				),
			);
		});

		it("explains distance instead of offering it when location is refused", async () => {
			// Location is an enhancement, never a gate — and the server rejects a
			// radius with no origin, so a control here could only ever fail.
			await renderFeed();
			await openSheet();

			expect(
				screen.getByText("Turn on location to filter by how far away food is."),
			).toBeTruthy();
			expect(screen.queryByText("0.5 mi")).toBeNull();
		});

		it("drops the distance filter if the fix is lost", async () => {
			// Permission can be revoked after a radius was already chosen. Sending
			// radius_miles without lat/lng is a 400 from the server, so the feed
			// must quietly stop asking for it rather than start failing.
			grantLocation();
			render(<RecipientFeed />);
			await screen.findByText("Discover");
			await openSheet();
			fireEvent.press(screen.getByText("1 mi"));
			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ radiusMiles: 1 }),
				),
			);

			mockUseDeviceLocation.mockReturnValue({
				coords: null,
				status: "denied",
				request: mockRequestLocation,
			});
			screen.rerender(<RecipientFeed />);

			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ radiusMiles: undefined }),
				),
			);
		});

		it("stays reachable while a search is typed", async () => {
			// The icon used to be displaced by the clear button, so filtering a
			// search — exactly when you want it — was impossible.
			await renderFeed();
			fireEvent.changeText(
				screen.getByPlaceholderText("Search food, meals, or locations"),
				"pizza",
			);

			expect(await screen.findByLabelText("Clear search")).toBeTruthy();
			expect(await openSheet()).toBeTruthy();
		});

		it("clears everything from one button", async () => {
			await renderFeed();
			fireEvent.press(screen.getByText("vegetarian"));
			await openSheet();
			fireEvent.press(screen.getByText("30m"));
			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ maxMinutes: 30, dietary: ["vegetarian"] }),
				),
			);

			fireEvent.press(screen.getByText("Clear all"));

			await waitFor(() =>
				expect(mockFeed).toHaveBeenLastCalledWith(
					expect.objectContaining({ maxMinutes: undefined, dietary: undefined }),
				),
			);
		});

		it("counts the filters actually being applied", async () => {
			await renderFeed();
			fireEvent.press(screen.getByText("vegetarian"));
			fireEvent.press(screen.getByText("Expiring soon"));

			expect(await screen.findByLabelText("Filters, 2 active")).toBeTruthy();
		});
	});

	describe("live updates", () => {
		it("applies a quantity change without refetching", async () => {
			await renderFeed();
			const before = mockFeed.mock.calls.length;
			expect(screen.getByText("4 portions")).toBeTruthy();

			act(() => emit(streamEvent({ listing_id: "l1", quantity_remaining: 2 })));

			// The count moves on the card itself — someone else claiming used to
			// be invisible until the listing ran out and the card vanished.
			expect(await screen.findByText("2 portions")).toBeTruthy();
			// The card stays; no round trip was needed to move the number.
			expect(screen.getByText("Leftover pizza")).toBeTruthy();
			expect(mockFeed).toHaveBeenCalledTimes(before);
		});

		it("drops a listing that has run out", async () => {
			await renderFeed();
			act(() => emit(streamEvent({ listing_id: "l1", quantity_remaining: 0 })));
			await waitFor(() => expect(screen.queryByText("Leftover pizza")).toBeNull());
		});

		it("drops a listing that is no longer active", async () => {
			await renderFeed();
			act(() =>
				emit(streamEvent({ listing_id: "l1", status: "cancelled", quantity_remaining: 5 })),
			);
			await waitFor(() => expect(screen.queryByText("Leftover pizza")).toBeNull());
		});

		it("refetches when something arrives that isn't on this page", async () => {
			// A stranger's id is almost always a brand-new post; the server's filters
			// decide whether it belongs in this feed, not the client's.
			await renderFeed();
			const before = mockFeed.mock.calls.length;

			act(() => emit(streamEvent({ listing_id: "brand-new" })));

			await waitFor(() => expect(mockFeed.mock.calls.length).toBe(before + 1));
		});
	});

	describe("pagination", () => {
		it("appends the next page and drops duplicates", async () => {
			// A listing can arrive over SSE between pages, so page two may repeat it.
			mockFeed.mockResolvedValueOnce({
				items: [makeListing({ id: "l1", title: "Leftover pizza" })],
				nextCursor: "cursor-1",
			});
			render(<RecipientFeed />);
			await screen.findByText("Leftover pizza");

			mockFeed.mockResolvedValueOnce({
				items: [
					makeListing({ id: "l1", title: "Leftover pizza" }),
					makeListing({ id: "l2", title: "Bagels" }),
				],
				nextCursor: null,
			});
			// Scrolling to the end can't be simulated meaningfully without layout,
			// so drive the list's own end-reached hook directly.
			const list = screen.UNSAFE_getAllByProps({ onEndReachedThreshold: 0.4 })[0];
			await act(async () => {
				list.props.onEndReached();
			});

			await waitFor(() => expect(screen.getByText("Bagels")).toBeTruthy());
			expect(screen.getAllByText("Leftover pizza")).toHaveLength(1);
		});
	});

	describe("failure", () => {
		it("offers a retry rather than an empty screen", async () => {
			const { ApiError } = jest.requireMock("@/lib/api");
			mockFeed.mockRejectedValue(new ApiError(500, "Couldn't load food nearby."));

			render(<RecipientFeed />);

			expect(await screen.findByText("Couldn't load food nearby.")).toBeTruthy();
			const attempts = mockFeed.mock.calls.length;

			fireEvent.press(screen.getByText("Try again"));
			await waitFor(() => expect(mockFeed.mock.calls.length).toBe(attempts + 1));
		});
	});

	// There is no connectivity library — both are native modules — so offline is
	// inferred from the shape of the failure. An ApiError means the server
	// answered and objected; anything else means the request never arrived.
	describe("offline", () => {
		it("says so, rather than blaming the food, when nothing reached the server", async () => {
			mockFeed.mockRejectedValue(new TypeError("Network request failed"));

			render(<RecipientFeed />);

			expect(await screen.findByText("You're offline")).toBeTruthy();
			// Not the generic load failure, which would send someone looking for a
			// problem with the app.
			expect(screen.queryByText("Couldn't load food nearby.")).toBeNull();
		});

		it("keeps a server's own complaint separate from being offline", async () => {
			const { ApiError } = jest.requireMock("@/lib/api");
			mockFeed.mockRejectedValue(new ApiError(500, "Something broke."));

			render(<RecipientFeed />);

			expect(await screen.findByText("Something broke.")).toBeTruthy();
			expect(screen.queryByText("You're offline")).toBeNull();
		});

		it("keeps showing the food it already had, under a strip", async () => {
			await renderFeed();
			mockFeed.mockRejectedValue(new TypeError("Network request failed"));

			await act(async () => {
				screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
			});

			await waitFor(() =>
				expect(
					screen.getByText("You're offline — showing the last food we saw."),
				).toBeTruthy(),
			);
			// Stale food still beats an empty page; blanking it would throw away
			// the only useful thing left on screen.
			expect(screen.getByLabelText(/Leftover pizza/)).toBeTruthy();
		});
	});

	it("opens a listing when its card is tapped", async () => {
		await renderFeed();
		fireEvent.press(screen.getByLabelText(/Leftover pizza/));
		expect(mockPush).toHaveBeenCalledWith("/listing/l1");
	});
});
