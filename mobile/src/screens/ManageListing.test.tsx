import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { confirmPickup, fetchListingClaims, markNoShow } from "@/lib/claims";
import { cancelListing, fetchListing, setListingStatus } from "@/lib/listings";
import { makeClaim, makeListing } from "@/test-utils/fixtures";
import { renderWithProviders } from "@/test-utils/render";
// Lives under app/ because it is a route; the test cannot sit beside it, since
// expo-router's require.context would register a .test.tsx there as a route.
import ManageListing from "../../app/(app)/manage/[id]";

jest.mock("@/lib/api", () =>
	jest.requireActual("@/test-utils/render").apiModuleMock(),
);
jest.mock("@/lib/listings", () => ({
	fetchListing: jest.fn(),
	setListingStatus: jest.fn(),
	cancelListing: jest.fn(),
}));
jest.mock("@/lib/claims", () => ({
	fetchListingClaims: jest.fn(),
	confirmPickup: jest.fn(),
	markNoShow: jest.fn(),
}));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
	useLocalSearchParams: () => ({ id: "l1" }),
	useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn() }),
}));
jest.mock("@/hooks/useNow", () => ({
	useNow: () => new Date("2026-08-04T12:00:00Z").getTime(),
}));

const mockListing = fetchListing as jest.MockedFunction<typeof fetchListing>;
const mockClaims = fetchListingClaims as jest.MockedFunction<
	typeof fetchListingClaims
>;
const mockStatus = setListingStatus as jest.MockedFunction<
	typeof setListingStatus
>;
const mockCancel = cancelListing as jest.MockedFunction<typeof cancelListing>;
const mockPickup = confirmPickup as jest.MockedFunction<typeof confirmPickup>;
const mockNoShow = markNoShow as jest.MockedFunction<typeof markNoShow>;

function renderManage() {
	return renderWithProviders(<ManageListing />);
}

describe("manage listing", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockListing.mockResolvedValue(makeListing());
		mockClaims.mockResolvedValue([]);
		mockStatus.mockResolvedValue(makeListing());
		mockCancel.mockResolvedValue(makeListing({ status: "cancelled" }));
		mockPickup.mockResolvedValue(makeClaim({ status: "picked_up" }));
		mockNoShow.mockResolvedValue(makeClaim({ status: "no_show" }));
	});

	describe("the summary", () => {
		it("shows how much is left against the total", async () => {
			mockListing.mockResolvedValue(
				makeListing({ quantity_total: 10, quantity_remaining: 4 }),
			);
			renderManage();

			expect(await screen.findByText("4")).toBeTruthy();
			expect(screen.getByText("of 10 servings")).toBeTruthy();
			expect(screen.getByText(/6 claimed/)).toBeTruthy();
		});

		it("pluralises the interested count", async () => {
			mockListing.mockResolvedValue(makeListing({ interested_count: 1 }));
			renderManage();
			expect(await screen.findByText(/1 person interested/)).toBeTruthy();
		});

		it("says people for more than one", async () => {
			mockListing.mockResolvedValue(makeListing({ interested_count: 3 }));
			renderManage();
			expect(await screen.findByText(/3 people interested/)).toBeTruthy();
		});
	});

	describe("stock toggle", () => {
		it("marks a live post out of stock", async () => {
			renderManage();
			fireEvent.press(await screen.findByText("Out of Stock"));

			await waitFor(() =>
				expect(mockStatus).toHaveBeenCalledWith("l1", "claimed"),
			);
			expect(await screen.findByText("Marked out of stock.")).toBeTruthy();
		});

		it("offers to reopen a post that is already out of stock", async () => {
			mockListing.mockResolvedValue(makeListing({ status: "claimed" }));
			renderManage();

			fireEvent.press(await screen.findByText("Reopen"));

			await waitFor(() =>
				expect(mockStatus).toHaveBeenCalledWith("l1", "active"),
			);
			expect(await screen.findByText("Post reopened.")).toBeTruthy();
		});
	});

	describe("ending the post", () => {
		it("asks before ending, and says what will happen", async () => {
			renderManage();
			fireEvent.press(await screen.findByText("End Post Early"));

			expect(await screen.findByText("End this post early?")).toBeTruthy();
			expect(
				screen.getByText(/disappears for everyone immediately/),
			).toBeTruthy();
			// Nothing has happened yet — the dialog is a real gate.
			expect(mockCancel).not.toHaveBeenCalled();
		});

		it("does nothing when the confirmation is declined", async () => {
			renderManage();
			fireEvent.press(await screen.findByText("End Post Early"));
			fireEvent.press(await screen.findByText("Cancel"));

			await waitFor(() =>
				expect(screen.queryByText("End this post early?")).toBeNull(),
			);
			expect(mockCancel).not.toHaveBeenCalled();
			expect(mockReplace).not.toHaveBeenCalled();
		});

		it("ends the post and goes back to the dashboard once confirmed", async () => {
			renderManage();
			fireEvent.press(await screen.findByText("End Post Early"));
			fireEvent.press(await screen.findByText("End post"));

			await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("l1"));
			await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/posts"));
		});
	});

	describe("claims", () => {
		it("explains the empty list rather than showing nothing", async () => {
			renderManage();
			expect(await screen.findByText(/No claims yet/)).toBeTruthy();
		});

		it("lists who claimed and how much", async () => {
			mockClaims.mockResolvedValue([
				makeClaim({ recipient_name: "Sam Rivera", quantity: 2 }),
			]);
			renderManage();

			expect(await screen.findByText("Sam Rivera")).toBeTruthy();
			expect(screen.getByText(/Claimed 2 servings/)).toBeTruthy();
			expect(screen.getByText("Waiting")).toBeTruthy();
		});

		it("confirms a pickup without asking — it isn't destructive", async () => {
			mockClaims.mockResolvedValue([makeClaim()]);
			renderManage();

			fireEvent.press(await screen.findByText("Confirm pickup"));

			await waitFor(() => expect(mockPickup).toHaveBeenCalledWith("c1"));
			expect(await screen.findByText("Pickup confirmed.")).toBeTruthy();
		});

		it("asks before marking a no-show, since it takes the portion back", async () => {
			mockClaims.mockResolvedValue([
				makeClaim({ recipient_name: "Sam Rivera" }),
			]);
			renderManage();

			fireEvent.press(await screen.findByText("No-show"));

			expect(await screen.findByText("Mark as no-show?")).toBeTruthy();
			expect(screen.getByText(/Sam Rivera didn't collect/)).toBeTruthy();
			expect(mockNoShow).not.toHaveBeenCalled();

			fireEvent.press(screen.getByText("Mark no-show"));
			await waitFor(() => expect(mockNoShow).toHaveBeenCalledWith("c1"));
		});

		it("offers no handoff buttons on a claim that is already settled", async () => {
			mockClaims.mockResolvedValue([makeClaim({ status: "picked_up" })]);
			renderManage();

			expect(await screen.findByText("Picked up")).toBeTruthy();
			expect(screen.queryByText("Confirm pickup")).toBeNull();
			expect(screen.queryByText("No-show")).toBeNull();
		});
	});

	describe("failures", () => {
		it("surfaces the server's reason when an action is refused", async () => {
			const { ApiError } = jest.requireMock("@/lib/api");
			mockStatus.mockRejectedValue(new ApiError(409, "Post already ended."));
			renderManage();

			fireEvent.press(await screen.findByText("Out of Stock"));

			expect(await screen.findByText("Post already ended.")).toBeTruthy();
		});

		it("offers a way out when the post won't load", async () => {
			const { ApiError } = jest.requireMock("@/lib/api");
			mockListing.mockRejectedValue(new ApiError(404, "Post not found."));
			renderManage();

			expect(await screen.findByText("Post not found.")).toBeTruthy();
			expect(screen.getByText("Back to your posts")).toBeTruthy();
		});
	});
});
