import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { changeRole, type UserProfile, updateProfile } from "@/lib/api";
import { renderWithProviders } from "@/test-utils/render";
import { Profile } from "./Profile";

jest.mock("@/lib/api", () => jest.requireActual("@/test-utils/render").apiModuleMock());
jest.mock("@/lib/listings", () => ({
	DIETARY_TAGS: ["vegetarian", "vegan", "halal", "kosher", "gluten-free"],
}));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

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
const mockChangeRole = changeRole as jest.MockedFunction<typeof changeRole>;

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
	return {
		id: "u1",
		email: "sun.devil@asu.edu",
		name: "Sun Devil",
		avatar_url: null,
		role: "recipient",
		dietary_prefs: [],
		terms_accepted_at: "2026-08-21T12:00:00Z",
		terms_version: "2026-08-21",
		terms_accepted_roles: ["recipient", "organizer"],
		terms_current: true,
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

	describe("switching account type", () => {
		/** Walks the real ConfirmDialog, which renderWithProviders mounts — the
		 *  guard is part of the feature, so stubbing it past would test less than
		 *  the screen actually does. */
		async function confirmSwitch(label: string) {
			fireEvent.press(screen.getByLabelText(`Switch to ${label} account`));
			fireEvent.press(await screen.findByText(`Become a ${label}`));
		}

		it("offers a recipient the way to become a host", () => {
			renderProfile();
			expect(screen.getByLabelText("Switch to host account")).toBeTruthy();
			expect(screen.getByText("You're set up to find and claim food.")).toBeTruthy();
		});

		it("offers a host the way to become a recipient", () => {
			renderProfile(profile({ role: "organizer" }));
			expect(screen.getByLabelText("Switch to recipient account")).toBeTruthy();
			expect(screen.getByText("You're set up to post surplus food.")).toBeTruthy();
		});

		it("does nothing if the confirmation is dismissed", async () => {
			renderProfile();
			fireEvent.press(screen.getByLabelText("Switch to host account"));
			fireEvent.press(await screen.findByText("Cancel"));

			await waitFor(() => expect(mockChangeRole).not.toHaveBeenCalled());
			expect(mockReplace).not.toHaveBeenCalled();
		});

		it("switches a recipient to host and lands them on the dashboard", async () => {
			mockChangeRole.mockResolvedValue(profile({ role: "organizer" }));
			renderProfile();

			await confirmSwitch("host");

			await waitFor(() => expect(mockChangeRole).toHaveBeenCalledWith("organizer"));
			expect(mockApply).toHaveBeenCalled();
			// The tab bar rebuilds from profile.role, but the route underneath does
			// not — without this the user is left on a tab their new role can't use.
			expect(mockReplace).toHaveBeenCalledWith("/posts");
		});

		it("switches a host to recipient and lands them on the feed", async () => {
			mockChangeRole.mockResolvedValue(profile({ role: "recipient" }));
			renderProfile(profile({ role: "organizer" }));

			await confirmSwitch("recipient");

			await waitFor(() => expect(mockChangeRole).toHaveBeenCalledWith("recipient"));
			expect(mockReplace).toHaveBeenCalledWith("/feed");
		});

		it("routes by what the server returned, not what was asked for", async () => {
			// The redirect reads updated.role rather than the requested role, so a
			// server that declines to move still lands the user somewhere valid.
			mockChangeRole.mockResolvedValue(profile({ role: "recipient" }));
			renderProfile();

			await confirmSwitch("host");

			await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/feed"));
		});

		it("shows the server's reason verbatim when the switch is refused", async () => {
			// The 409 names exactly what is outstanding. Flattening it to "couldn't
			// switch" would strip the only thing that tells the user what to do.
			const { ApiError } = jest.requireMock("@/lib/api");
			mockChangeRole.mockRejectedValue(
				new ApiError(
					409,
					"You have 2 posts still live and 1 person waiting to collect.",
				),
			);
			renderProfile(profile({ role: "organizer" }));

			await confirmSwitch("recipient");

			expect(
				await screen.findByText(
					"You have 2 posts still live and 1 person waiting to collect.",
				),
			).toBeTruthy();
			expect(mockReplace).not.toHaveBeenCalled();
		});

		it("keeps a refused switch away from the Save area", async () => {
			// Rendering it next to Save would read as the name having failed.
			const { ApiError } = jest.requireMock("@/lib/api");
			mockChangeRole.mockRejectedValue(new ApiError(409, "Still 1 post live."));
			renderProfile(profile({ role: "organizer" }));

			await confirmSwitch("recipient");
			await screen.findByText("Still 1 post live.");

			expect(screen.queryByText("Name can't be empty.")).toBeNull();
			expect(mockApply).not.toHaveBeenCalled();
		});
	});

	it("signs out", () => {
		renderProfile();
		fireEvent.press(screen.getByText("Sign out"));
		expect(mockSignOut).toHaveBeenCalledTimes(1);
	});
});
