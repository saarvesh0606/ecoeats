import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ToastProvider } from "@/components/ui/Toast";
import { createClaim } from "@/lib/claims";
import { haptics } from "@/lib/haptics";
import { fetchListing, type Listing } from "@/lib/listings";
// The screen itself lives under app/, because it is a route. The test cannot
// sit beside it: expo-router's require.context matches every .tsx under app/
// without excluding test files, so a test there would register as a route.
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

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
	useLocalSearchParams: () => ({ id: "l1" }),
	useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn() }),
}));

// Freeze the clock the screen counts down against. With a live clock the
// minute boundary can tick mid-test — a fixture 52m00.5s out reads "51m" the
// moment a slow first render eats that half second.
jest.mock("@/hooks/useNow", () => ({
	useNow: () => new Date("2026-08-04T12:00:00Z").getTime(),
}));
const NOW = new Date("2026-08-04T12:00:00Z").getTime();

const mockFetch = fetchListing as jest.MockedFunction<typeof fetchListing>;
const mockClaim = createClaim as jest.MockedFunction<typeof createClaim>;

function listing(overrides: Partial<Listing> = {}): Listing {
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
		...overrides,
	};
}

function renderDetail() {
	return render(
		<ToastProvider>
			<ListingDetailScreen />
		</ToastProvider>,
	);
}

describe("listing detail", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockClaim.mockResolvedValue({} as never);
	});

	describe("expiry wording", () => {
		it("says 'Expires in 52m', not 'Expires in 52m left'", async () => {
			// Regression guard for the doubled word: formatTimeLeft already appends
			// "left" for the feed badge, so this row must use the bare duration.
			mockFetch.mockResolvedValue(listing());
			renderDetail();

			expect(await screen.findByText(/Expires in 52m \(by /)).toBeTruthy();
			expect(screen.queryByText(/Expires in .*left/)).toBeNull();
		});

		it("still shows the bare countdown on the hero badge", async () => {
			mockFetch.mockResolvedValue(listing());
			renderDetail();
			expect(await screen.findByText("52m left")).toBeTruthy();
		});

		it("reads 'Expired at ...' once the deadline has passed", async () => {
			// The old wording produced "Expires in Expired", which is worse than
			// untidy — it reads as a bug to the user.
			mockFetch.mockResolvedValue(
				listing({
					expires_at: new Date(NOW - 60_000).toISOString(),
					is_claimable: false,
					seconds_remaining: 0,
				}),
			);
			renderDetail();

			expect(await screen.findByText(/^Expired at /)).toBeTruthy();
			expect(screen.queryByText(/Expires in/)).toBeNull();
		});
	});

	describe("portions stepper", () => {
		it("starts at one and offers no stepper for a single portion", async () => {
			mockFetch.mockResolvedValue(listing({ quantity_remaining: 1 }));
			renderDetail();
			await screen.findByText("Claim This Food");
			expect(screen.queryByLabelText("More portions")).toBeNull();
		});

		it("relabels the button as the count goes up", async () => {
			mockFetch.mockResolvedValue(listing());
			renderDetail();
			await screen.findByText("Claim This Food");

			fireEvent.press(screen.getByLabelText("More portions"));
			expect(screen.getByText("Claim 2 Portions")).toBeTruthy();

			fireEvent.press(screen.getByLabelText("More portions"));
			expect(screen.getByText("Claim 3 Portions")).toBeTruthy();
		});

		it("will not go above what is actually left", async () => {
			mockFetch.mockResolvedValue(listing({ quantity_remaining: 2 }));
			renderDetail();
			await screen.findByText("Claim This Food");

			fireEvent.press(screen.getByLabelText("More portions"));
			fireEvent.press(screen.getByLabelText("More portions"));
			fireEvent.press(screen.getByLabelText("More portions"));

			expect(screen.getByText("Claim 2 Portions")).toBeTruthy();
		});

		it("will not go below one", async () => {
			mockFetch.mockResolvedValue(listing());
			renderDetail();
			await screen.findByText("Claim This Food");

			fireEvent.press(screen.getByLabelText("Fewer portions"));
			fireEvent.press(screen.getByLabelText("Fewer portions"));

			expect(screen.getByText("Claim This Food")).toBeTruthy();
		});
	});

	describe("claiming", () => {
		it("sends the chosen quantity, not always one", async () => {
			mockFetch.mockResolvedValue(listing());
			renderDetail();
			await screen.findByText("Claim This Food");

			fireEvent.press(screen.getByLabelText("More portions"));
			fireEvent.press(screen.getByText("Claim 2 Portions"));

			await waitFor(() => expect(mockClaim).toHaveBeenCalledWith("l1", 2));
		});

		it("moves you to your claims once it succeeds", async () => {
			mockFetch.mockResolvedValue(listing());
			renderDetail();
			fireEvent.press(await screen.findByText("Claim This Food"));

			await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/claims"));
		});

		it("shows the server's reason when the claim is refused", async () => {
			const { ApiError } = jest.requireMock("@/lib/api");
			mockFetch.mockResolvedValue(listing());
			mockClaim.mockRejectedValue(new ApiError(409, "You already claimed this."));

			renderDetail();
			fireEvent.press(await screen.findByText("Claim This Food"));

			expect(await screen.findByText("You already claimed this.")).toBeTruthy();
			expect(mockReplace).not.toHaveBeenCalled();
		});

		it("says why it can't be claimed when nothing is left", async () => {
			mockFetch.mockResolvedValue(
				listing({ quantity_remaining: 0, is_claimable: false }),
			);
			renderDetail();
			expect(await screen.findByText("All claimed")).toBeTruthy();
		});
	});

	describe("how a claim feels", () => {
		it("confirms a landed claim in the hand, not only on a screen you're leaving", async () => {
			// The toast and the claims list arrive together as the route replaces
			// itself, so the success pattern is the one signal that survives the
			// transition and marks the food as actually yours.
			mockFetch.mockResolvedValue(listing());
			renderDetail();
			fireEvent.press(await screen.findByText("Claim This Food"));

			await waitFor(() => expect(haptics.success).toHaveBeenCalledTimes(1));
			expect(haptics.error).not.toHaveBeenCalled();
		});

		it("feels different when someone else got the last portion", async () => {
			// Losing the race is the common failure here. Reading differently is not
			// enough when the phone is halfway back into a pocket.
			const { ApiError } = jest.requireMock("@/lib/api");
			mockFetch.mockResolvedValue(listing());
			mockClaim.mockRejectedValue(new ApiError(409, "You already claimed this."));

			renderDetail();
			fireEvent.press(await screen.findByText("Claim This Food"));

			await waitFor(() => expect(haptics.error).toHaveBeenCalledTimes(1));
			expect(haptics.success).not.toHaveBeenCalled();
		});

		it("ticks each step of the portions stepper", async () => {
			mockFetch.mockResolvedValue(listing());
			renderDetail();
			await screen.findByText("Claim This Food");

			fireEvent.press(screen.getByLabelText("More portions"));

			expect(haptics.select).toHaveBeenCalledTimes(1);
			expect(haptics.bump).not.toHaveBeenCalled();
		});

		it("feels the stepper refuse rather than going quiet at its limit", async () => {
			// A dead control that pulses exactly like a live one leaves you pressing
			// it again, wondering whether the tap registered at all.
			mockFetch.mockResolvedValue(listing({ quantity_remaining: 2 }));
			renderDetail();
			await screen.findByText("Claim This Food");

			fireEvent.press(screen.getByLabelText("More portions")); // 1 -> 2, ticks
			fireEvent.press(screen.getByLabelText("More portions")); // held at 2

			expect(haptics.select).toHaveBeenCalledTimes(1);
			expect(haptics.bump).toHaveBeenCalledTimes(1);
		});
	});

	it("offers a way back when the listing won't load", async () => {
		const { ApiError } = jest.requireMock("@/lib/api");
		mockFetch.mockRejectedValue(new ApiError(404, "Listing not found."));
		renderDetail();
		expect(await screen.findByText("Listing not found.")).toBeTruthy();
		expect(screen.getByText("Go back")).toBeTruthy();
	});
});
