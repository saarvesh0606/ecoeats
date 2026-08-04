import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { type UserProfile, updateProfile } from "@/lib/api";
import { renderWithProviders } from "@/test-utils/render";
import { Profile } from "./Profile";

jest.mock("@/lib/api", () => jest.requireActual("@/test-utils/render").apiModuleMock());
jest.mock("@/lib/listings", () => ({
	DIETARY_TAGS: ["vegetarian", "vegan", "halal", "kosher", "gluten-free"],
}));

const mockApply = jest.fn();
const mockSignOut = jest.fn();
let mockCurrentProfile: UserProfile | null = null;
jest.mock("@/context/AuthContext", () => ({
	useAuth: () => ({
		profile: mockCurrentProfile,
		applyProfile: mockApply,
		signOut: mockSignOut,
	}),
}));

const mockUpdate = updateProfile as jest.MockedFunction<typeof updateProfile>;

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
	return {
		id: "u1",
		email: "sun.devil@asu.edu",
		name: "Sun Devil",
		avatar_url: null,
		role: "recipient",
		dietary_prefs: [],
		created_at: new Date("2026-08-04T12:00:00Z").toISOString(),
		...overrides,
	};
}

function renderProfile(p: UserProfile = profile()) {
	mockCurrentProfile = p;
	return renderWithProviders(<Profile />);
}

describe("Profile", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUpdate.mockImplementation(async (patch) =>
			profile({ name: patch.name, dietary_prefs: patch.dietary_prefs ?? [] }),
		);
	});

	it("shows who you are signed in as", () => {
		renderProfile();
		expect(screen.getByText("Sun Devil")).toBeTruthy();
		expect(screen.getByText("sun.devil@asu.edu")).toBeTruthy();
		expect(screen.getByText("Recipient")).toBeTruthy();
	});

	it("labels a host differently", () => {
		renderProfile(profile({ role: "organizer" }));
		expect(screen.getByText("ASU Host")).toBeTruthy();
	});

	describe("saving", () => {
		it("keeps Save disabled until something actually changes", () => {
			renderProfile();
			fireEvent.press(screen.getByText("Save changes"));
			expect(mockUpdate).not.toHaveBeenCalled();
		});

		it("saves an edited name and confirms it", async () => {
			renderProfile();
			fireEvent.changeText(screen.getByLabelText("Name"), "Sparky");

			fireEvent.press(screen.getByText("Save changes"));

			await waitFor(() =>
				expect(mockUpdate).toHaveBeenCalledWith({
					name: "Sparky",
					dietary_prefs: [],
				}),
			);
			expect(await screen.findByText("Profile saved.")).toBeTruthy();
			expect(mockApply).toHaveBeenCalled();
		});

		it("trims the name rather than storing the spaces", async () => {
			renderProfile();
			fireEvent.changeText(screen.getByLabelText("Name"), "  Sparky  ");
			fireEvent.press(screen.getByText("Save changes"));

			await waitFor(() =>
				expect(mockUpdate).toHaveBeenCalledWith(
					expect.objectContaining({ name: "Sparky" }),
				),
			);
		});

		it("refuses to save an empty name", async () => {
			renderProfile();
			fireEvent.changeText(screen.getByLabelText("Name"), "   ");
			fireEvent.press(screen.getByText("Save changes"));

			expect(await screen.findByText("Name can't be empty.")).toBeTruthy();
			expect(mockUpdate).not.toHaveBeenCalled();
		});

		it("surfaces the server's reason when saving fails", async () => {
			const { ApiError } = jest.requireMock("@/lib/api");
			mockUpdate.mockRejectedValue(new ApiError(400, "That name is taken."));

			renderProfile();
			fireEvent.changeText(screen.getByLabelText("Name"), "Sparky");
			fireEvent.press(screen.getByText("Save changes"));

			expect(await screen.findByText("That name is taken.")).toBeTruthy();
		});
	});

	describe("dietary preferences", () => {
		it("offers them to recipients", () => {
			renderProfile();
			expect(screen.getByText("Dietary preferences")).toBeTruthy();
			expect(screen.getByText("vegetarian")).toBeTruthy();
		});

		it("hides them from hosts, who don't claim food", () => {
			renderProfile(profile({ role: "organizer" }));
			expect(screen.queryByText("Dietary preferences")).toBeNull();
		});

		it("toggles a preference on and sends it", async () => {
			renderProfile();
			fireEvent.press(screen.getByText("vegetarian"));

			fireEvent.press(screen.getByText("Save changes"));

			await waitFor(() =>
				expect(mockUpdate).toHaveBeenCalledWith({
					name: "Sun Devil",
					dietary_prefs: ["vegetarian"],
				}),
			);
		});

		it("toggles one back off", async () => {
			renderProfile(profile({ dietary_prefs: ["vegetarian", "vegan"] }));
			fireEvent.press(screen.getByText("vegetarian"));
			fireEvent.press(screen.getByText("Save changes"));

			await waitFor(() =>
				expect(mockUpdate).toHaveBeenCalledWith(
					expect.objectContaining({ dietary_prefs: ["vegan"] }),
				),
			);
		});

		it("treats reordering as no change at all", () => {
			// The dirty check compares sorted lists — flipping a tag off and back on
			// must not leave Save enabled with nothing to send.
			renderProfile(profile({ dietary_prefs: ["vegan"] }));
			fireEvent.press(screen.getByText("vegetarian"));
			fireEvent.press(screen.getByText("vegetarian"));

			fireEvent.press(screen.getByText("Save changes"));
			expect(mockUpdate).not.toHaveBeenCalled();
		});

		it("never sends preferences for a host", async () => {
			renderProfile(profile({ role: "organizer" }));
			fireEvent.changeText(screen.getByLabelText("Name"), "Front Desk");
			fireEvent.press(screen.getByText("Save changes"));

			await waitFor(() =>
				expect(mockUpdate).toHaveBeenCalledWith({
					name: "Front Desk",
					dietary_prefs: undefined,
				}),
			);
		});
	});

	it("signs out", () => {
		renderProfile();
		fireEvent.press(screen.getByText("Sign out"));
		expect(mockSignOut).toHaveBeenCalledTimes(1);
	});
});
