import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { deleteAccount } from "@/lib/api";
import { renderWithProviders } from "@/test-utils/render";
import { Settings } from "./Settings";

jest.mock("@/lib/api", () => ({
	...jest.requireActual("@/test-utils/render").apiModuleMock(),
	deleteAccount: jest.fn(),
}));

jest.mock("expo-constants", () => ({
	__esModule: true,
	default: { expoConfig: { version: "1.2.3", ios: { buildNumber: "42" } } },
}));

const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));

const mockSignOut = jest.fn();
const mockSetPushMuted = jest.fn(async () => {});
let mockRole: "organizer" | "recipient" = "recipient";
jest.mock("@/context/AuthContext", () => ({
	useAuth: () => ({
		signOut: mockSignOut,
		setPushMuted: mockSetPushMuted,
		profile: { role: mockRole, terms_accepted_at: "2026-08-21T12:00:00Z" },
	}),
}));

const mockMuted = jest.fn(async () => false);
jest.mock("@/lib/pushPreference", () => ({
	arePushNotificationsMuted: () => mockMuted(),
}));

const mockDelete = deleteAccount as jest.MockedFunction<typeof deleteAccount>;

/** Answer the app's confirm dialog. */
async function confirmWith(label: string) {
	fireEvent.press(await screen.findByText(label));
}

describe("Settings", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockRole = "recipient";
		mockMuted.mockResolvedValue(false);
		mockDelete.mockResolvedValue(undefined);
	});

	it("shows which build this is", async () => {
		// The first thing worth knowing in a bug report.
		renderWithProviders(<Settings />);
		expect(await screen.findByText("1.2.3")).toBeTruthy();
		expect(screen.getByText("42")).toBeTruthy();
	});

	describe("legal documents", () => {
		it("opens the terms", async () => {
			renderWithProviders(<Settings />);
			fireEvent.press(screen.getByLabelText("Terms of use"));
			expect(await screen.findByText("Who can use EcoEats")).toBeTruthy();
		});

		it("opens the food safety disclaimer", async () => {
			renderWithProviders(<Settings />);
			fireEvent.press(screen.getByLabelText("Food safety"));
			expect(await screen.findByText("Allergies and dietary needs")).toBeTruthy();
		});

		it("opens the privacy notice", async () => {
			renderWithProviders(<Settings />);
			fireEvent.press(screen.getByLabelText("Privacy"));
			expect(await screen.findByText("What we collect")).toBeTruthy();
		});

		it("comes back to the list", async () => {
			renderWithProviders(<Settings />);
			fireEvent.press(screen.getByLabelText("Privacy"));
			await screen.findByText("What we collect");

			fireEvent.press(screen.getByLabelText("Back to settings"));

			expect(await screen.findByLabelText("Terms of use")).toBeTruthy();
		});
	});

	describe("notifications", () => {
		it("hands the push token back when muted", async () => {
			// Muting has to actually stop delivery, not just hide banners.
			renderWithProviders(<Settings />);
			fireEvent(screen.getByLabelText("Mute notifications"), "valueChange", true);

			await waitFor(() => expect(mockSetPushMuted).toHaveBeenCalledWith(true));
		});

		it("remembers a device that was already muted", async () => {
			mockMuted.mockResolvedValue(true);
			renderWithProviders(<Settings />);

			await waitFor(() =>
				expect(screen.getByLabelText("Mute notifications").props.value).toBe(
					true,
				),
			);
		});
	});

	describe("deleting the account", () => {
		it("asks first, and does nothing if you back out", async () => {
			renderWithProviders(<Settings />);
			fireEvent.press(screen.getByLabelText("Delete account"));

			await confirmWith("Keep my account");

			expect(mockDelete).not.toHaveBeenCalled();
		});

		it("deletes and signs out once confirmed", async () => {
			renderWithProviders(<Settings />);
			fireEvent.press(screen.getByLabelText("Delete account"));

			await confirmWith("Delete everything");

			await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
			// Nothing left to be signed in to.
			await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
		});

		it("warns a host that other people's claims go too", async () => {
			// A recipient loses their own claims; a host takes other people's food
			// with them. Those deserve different warnings.
			mockRole = "organizer";
			renderWithProviders(<Settings />);
			fireEvent.press(screen.getByLabelText("Delete account"));

			expect(
				await screen.findByText(/claims other people have made/),
			).toBeTruthy();
		});

		it("keeps the account when the server refuses", async () => {
			mockDelete.mockRejectedValue(new Error("offline"));
			renderWithProviders(<Settings />);
			fireEvent.press(screen.getByLabelText("Delete account"));

			await confirmWith("Delete everything");

			await waitFor(() => expect(mockDelete).toHaveBeenCalled());
			expect(mockSignOut).not.toHaveBeenCalled();
		});
	});
});
