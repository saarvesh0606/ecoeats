import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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

	describe("live updates", () => {
		it("applies a quantity change without refetching", async () => {
			await renderFeed();
			const before = mockFeed.mock.calls.length;

			act(() => emit(streamEvent({ listing_id: "l1", quantity_remaining: 2 })));

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

	it("opens a listing when its card is tapped", async () => {
		await renderFeed();
		fireEvent.press(screen.getByLabelText(/Leftover pizza/));
		expect(mockPush).toHaveBeenCalledWith("/listing/l1");
	});
});
