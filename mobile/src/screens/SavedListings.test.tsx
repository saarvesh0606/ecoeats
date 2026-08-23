import { render, screen, waitFor } from "@testing-library/react-native";
import type { Listing } from "@/lib/listings";
import { fetchSaved } from "@/lib/listings";
import { SavedListings } from "./SavedListings";

jest.mock("@/lib/api", () =>
	jest.requireActual("@/test-utils/render").apiModuleMock(),
);

jest.mock("@/lib/listings", () => ({
	fetchSaved: jest.fn(),
	saveListing: jest.fn(),
	unsaveListing: jest.fn(),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
	useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
	// No navigator here to hand the screen focus, so the honest stand-in is the
	// effect it replaced: run on mount, and again if the callback changes.
	useFocusEffect: (cb: () => void) => require("react").useEffect(cb, [cb]),
}));

jest.mock("@/context/AuthContext", () => ({
	useAuth: () => ({ profile: { dietary_prefs: [] } }),
}));

jest.mock("@/hooks/useNow", () => ({
	useNow: () => new Date("2026-08-23T12:00:00Z").getTime(),
}));

const mockFetch = fetchSaved as jest.MockedFunction<typeof fetchSaved>;

function makeListing(overrides: Partial<Listing> = {}): Listing {
	return {
		id: "listing-1",
		title: "Leftover pizza",
		description: "Cheese and pepperoni",
		allergens: null,
		dietary_tags: ["vegetarian"],
		quantity_total: 12,
		quantity_remaining: 8,
		campus: "Tempe",
		building: "Memorial Union",
		room: "221",
		placement_note: null,
		lat: 33.4179,
		lng: -111.9346,
		expires_at: new Date("2026-08-23T12:30:00Z").toISOString(),
		status: "active",
		created_at: new Date("2026-08-23T11:30:00Z").toISOString(),
		scheduled_for: null,
		organizer: { id: "org-1", name: "Front Desk", rating: null, rating_count: 0 },
		photo_urls: [],
		distance_miles: null,
		seconds_remaining: 1800,
		is_claimable: true,
		is_saved: true,
		interested_count: 0,
		...overrides,
	};
}

describe("SavedListings", () => {
	beforeEach(() => jest.clearAllMocks());

	it("lists the food that was bookmarked", async () => {
		mockFetch.mockResolvedValue([
			makeListing(),
			makeListing({ id: "listing-2", title: "Bagels and cream cheese" }),
		]);

		render(<SavedListings />);

		expect(await screen.findByText("Leftover pizza")).toBeTruthy();
		expect(screen.getByText("Bagels and cream cheese")).toBeTruthy();
	});

	it("explains where bookmarks come from when there are none", async () => {
		mockFetch.mockResolvedValue([]);

		render(<SavedListings />);

		// An empty screen that only says "nothing here" leaves someone no way to
		// discover the control that fills it.
		expect(await screen.findByText("Nothing saved yet")).toBeTruthy();
		expect(
			screen.getByText("Tap the bookmark on any listing to keep it here."),
		).toBeTruthy();
	});

	it("keeps whatever is on screen when the fetch fails", async () => {
		mockFetch.mockRejectedValue(new Error("offline"));

		render(<SavedListings />);

		// Falls through to the empty state rather than hanging on the skeleton
		// forever, which is what a bare throw in the loader would do.
		expect(await screen.findByText("Nothing saved yet")).toBeTruthy();
	});

	it("reloads on focus, since bookmarks are made on another screen", async () => {
		mockFetch.mockResolvedValue([]);

		render(<SavedListings />);

		await waitFor(() => expect(mockFetch).toHaveBeenCalled());
	});
});
