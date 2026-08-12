import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { fetchImpact, fetchMyListings, publishListing } from "@/lib/listings";
import { makeListing, NOW } from "@/test-utils/fixtures";
import { OrganizerHome } from "./OrganizerHome";

jest.mock("@/lib/api", () => jest.requireActual("@/test-utils/render").apiModuleMock());
jest.mock("@/lib/listings", () => ({
	fetchMyListings: jest.fn(),
	fetchImpact: jest.fn(),
	publishListing: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
	useRouter: () => ({ push: mockPush }),
	// The real hook fires whenever the screen regains focus; under test it mounts
	// already focused, so running the callback once on mount is equivalent.
	useFocusEffect: (cb: () => void) => {
		const { useEffect } = jest.requireActual("react");
		useEffect(() => cb(), [cb]);
	},
}));

jest.mock("@/context/AuthContext", () => ({
	useAuth: () => ({ profile: { name: "Sun Devil Jones", role: "organizer" } }),
}));

const mockListings = fetchMyListings as jest.MockedFunction<typeof fetchMyListings>;
const mockImpact = fetchImpact as jest.MockedFunction<typeof fetchImpact>;
const mockPublish = publishListing as jest.MockedFunction<typeof publishListing>;

describe("OrganizerHome", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockListings.mockResolvedValue([]);
		mockImpact.mockResolvedValue({
			meals_shared: 0,
			people_fed: 0,
			active_posts: 0,
			pounds_saved: 0,
		});
		mockPublish.mockResolvedValue(makeListing());
	});

	it("greets the host by first name only", async () => {
		// The profile is "Sun Devil Jones"; a dashboard header wants "Sun".
		render(<OrganizerHome />);
		expect(await screen.findByText("Good to share, Sun.")).toBeTruthy();
	});

	it("shows the impact figures from the server", async () => {
		mockImpact.mockResolvedValue({
			meals_shared: 12,
			people_fed: 7,
			active_posts: 3,
			pounds_saved: 14.4,
		});
		render(<OrganizerHome />);

		await screen.findByText("Meals Shared");
		// The stats count up from zero, so the final figure arrives a beat later.
		await waitFor(() => expect(screen.getByText("12")).toBeTruthy());
		expect(screen.getByText("7")).toBeTruthy();
		expect(screen.getByText("3")).toBeTruthy();
	});

	it("marks the poundage an estimate, and keeps one decimal", async () => {
		// The number is derived from portions, never weighed. Shipping it
		// unqualified would be a claim the backend cannot support, so the
		// hedge is part of the feature, not decoration.
		mockImpact.mockResolvedValue({
			meals_shared: 12,
			people_fed: 7,
			active_posts: 3,
			pounds_saved: 14.4,
		});
		render(<OrganizerHome />);

		expect(
			await screen.findByText(/≈ 14.4 lbs kept out of a landfill/),
		).toBeTruthy();
		expect(screen.getByText(/est. from portions shared/)).toBeTruthy();
	});

	it("hides the poundage until there is something to report", async () => {
		// A host who has shared nothing gets no "≈0.0 lbs" — an empty impact
		// card should read as unstarted, not as a measured zero.
		render(<OrganizerHome />);

		await screen.findByText("Meals Shared");
		expect(screen.queryByText(/lbs kept out of a landfill/)).toBeNull();
	});

	describe("tabs", () => {
		const posts = [
			makeListing({ id: "a", title: "Live one", status: "active" }),
			makeListing({ id: "b", title: "Draft one", status: "draft" }),
			makeListing({
				id: "c",
				title: "Scheduled one",
				status: "scheduled",
				scheduled_for: new Date(NOW + 3_600_000).toISOString(),
			}),
			makeListing({ id: "d", title: "Done one", status: "expired" }),
		];

		it("opens on Active", async () => {
			mockListings.mockResolvedValue(posts);
			render(<OrganizerHome />);

			expect(await screen.findByText("Live one")).toBeTruthy();
			expect(screen.queryByText("Draft one")).toBeNull();
			expect(screen.queryByText("Done one")).toBeNull();
		});

		it("puts drafts and scheduled posts together", async () => {
			// Both are "not live yet" from the host's point of view; splitting them
			// across tabs would hide a draft nobody remembers making.
			mockListings.mockResolvedValue(posts);
			render(<OrganizerHome />);
			fireEvent.press(await screen.findByText("Scheduled"));

			expect(screen.getByText("Draft one")).toBeTruthy();
			expect(screen.getByText("Scheduled one")).toBeTruthy();
			expect(screen.queryByText("Live one")).toBeNull();
		});

		it("collects finished posts under Past", async () => {
			mockListings.mockResolvedValue(posts);
			render(<OrganizerHome />);
			fireEvent.press(await screen.findByText("Past"));

			expect(screen.getByText("Done one")).toBeTruthy();
			expect(screen.queryByText("Live one")).toBeNull();
		});
	});

	describe("post rows", () => {
		it("shows what's left against the total on a live post", async () => {
			mockListings.mockResolvedValue([
				makeListing({ status: "active", quantity_remaining: 4, quantity_total: 10 }),
			]);
			render(<OrganizerHome />);

			expect(await screen.findByText("4 left")).toBeTruthy();
			expect(screen.getByText(/of 10 servings/)).toBeTruthy();
		});

		it("opens the manage screen when a post is tapped", async () => {
			mockListings.mockResolvedValue([makeListing({ id: "l9", title: "Bagels" })]);
			render(<OrganizerHome />);

			fireEvent.press(await screen.findByLabelText("Manage Bagels"));

			expect(mockPush).toHaveBeenCalledWith("/manage/l9");
		});

		it("offers Publish now only on posts that aren't live yet", async () => {
			mockListings.mockResolvedValue([
				makeListing({ id: "a", title: "Live one", status: "active" }),
			]);
			render(<OrganizerHome />);
			await screen.findByText("Live one");
			expect(screen.queryByText("Publish now")).toBeNull();
		});

		it("publishes a draft and reloads", async () => {
			mockListings.mockResolvedValue([
				makeListing({ id: "d1", title: "Draft one", status: "draft" }),
			]);
			render(<OrganizerHome />);
			fireEvent.press(await screen.findByText("Scheduled"));

			fireEvent.press(screen.getByText("Publish now"));

			await waitFor(() => expect(mockPublish).toHaveBeenCalledWith("d1"));
			// Reloaded, so the row moves to Active without a manual refresh.
			await waitFor(() => expect(mockListings.mock.calls.length).toBeGreaterThan(1));
		});
	});

	it("always offers a way to create a post", async () => {
		render(<OrganizerHome />);
		fireEvent.press(await screen.findByText("+ Create New Post"));
		expect(mockPush).toHaveBeenCalledWith("/post");
	});

	it("shows a quiet retry rather than crashing when loading fails", async () => {
		// A lapsed session used to throw uncaught and drop the app into the red
		// error overlay on this screen.
		mockListings.mockRejectedValue(new Error("401"));
		render(<OrganizerHome />);

		expect(await screen.findByText("Couldn't load your dashboard")).toBeTruthy();

		const attempts = mockListings.mock.calls.length;
		fireEvent.press(screen.getByText("Retry"));
		await waitFor(() =>
			expect(mockListings.mock.calls.length).toBe(attempts + 1),
		);
	});
});
