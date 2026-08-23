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
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
	useRouter: () => ({ back: mockBack, push: mockPush }),
}));

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
const mockHapticsMuted = jest.fn(async () => false);
const mockSetHapticsMuted = jest.fn(async (_muted: boolean) => {});
const mockThemeChoice = jest.fn(async () => "system" as const);
const mockSaveTheme = jest.fn(async (_c: string) => {});
jest.mock("@/lib/preferences", () => ({
	arePushNotificationsMuted: () => mockMuted(),
	areHapticsMuted: () => mockHapticsMuted(),
	setHapticsMuted: (v: boolean) => mockSetHapticsMuted(v),
	getThemeChoice: () => mockThemeChoice(),
	setThemeChoice: (c: string) => mockSaveTheme(c),
}));

const mockSetScheme = jest.fn();
jest.mock("nativewind", () => ({
	colorScheme: { set: (v: string) => mockSetScheme(v), get: () => "light" },
	useColorScheme: () => ({ colorScheme: "light" }),
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
		mockHapticsMuted.mockResolvedValue(false);
		mockDelete.mockResolvedValue(undefined);
	});

	it("shows which build this is", async () => {
		// The first thing worth knowing in a bug report.
		renderWithProviders(<Settings />);
		expect(await screen.findByText("1.2.3")).toBeTruthy();
		expect(screen.getByText("42")).toBeTruthy();
	});

	describe("legal documents", () => {
		// Each is its own route, not content swapped in place. That is what makes
		// the phone's back gesture return here instead of throwing the reader out
		// to Profile — the gesture pops routes, and there used to be only one.
		it.each([
			["Terms of use", "terms"],
			["Food safety", "safety"],
			["Privacy", "privacy"],
		])("opens %s as its own screen", (label, doc) => {
			renderWithProviders(<Settings />);
			fireEvent.press(screen.getByLabelText(label));
			expect(mockPush).toHaveBeenCalledWith({
				pathname: "/settings/[doc]",
				params: { doc },
			});
		});
	});

	describe("feedback switches", () => {
		it("hands the push token back when muted", async () => {
			// Muting has to actually stop delivery, not just hide banners.
			renderWithProviders(<Settings />);
			fireEvent(
				screen.getByLabelText("Mute notifications"),
				"valueChange",
				true,
			);

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

		it("turns haptics off and remembers it", async () => {
			renderWithProviders(<Settings />);
			// The switch reads "Haptic feedback ON", so turning it off is false.
			fireEvent(screen.getByLabelText("Haptic feedback"), "valueChange", false);

			await waitFor(() =>
				expect(mockSetHapticsMuted).toHaveBeenCalledWith(true),
			);
		});

		it("shows haptics already off when the device says so", async () => {
			mockHapticsMuted.mockResolvedValue(true);
			renderWithProviders(<Settings />);

			await waitFor(() =>
				expect(screen.getByLabelText("Haptic feedback").props.value).toBe(
					false,
				),
			);
		});
	});

	describe("appearance", () => {
		it("offers following the phone as well as the two fixed choices", async () => {
			renderWithProviders(<Settings />);

			// "System" is the default and has to be reachable, otherwise someone who
			// tried dark can never hand the decision back to their phone.
			expect(await screen.findByText("Match my phone")).toBeTruthy();
			expect(screen.getByText("Light")).toBeTruthy();
			expect(screen.getByText("Dark")).toBeTruthy();
		});

		it("applies the choice and remembers it", async () => {
			renderWithProviders(<Settings />);
			fireEvent.press(await screen.findByText("Dark"));

			// Applied to the running app and written down. Doing only the first
			// loses it on next launch; only the second changes nothing on screen.
			await waitFor(() => expect(mockSetScheme).toHaveBeenCalledWith("dark"));
			expect(mockSaveTheme).toHaveBeenCalledWith("dark");
		});
	});

	describe("signing out", () => {
		it("reports that it is working, so nobody taps it twice", async () => {
			// Held open so the in-flight state can be observed; a resolved promise
			// would be finished before the first assertion could run.
			let finish = () => {};
			mockSignOut.mockReturnValue(
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
			);

			renderWithProviders(<Settings />);
			fireEvent.press(screen.getByLabelText("Sign out"));

			await waitFor(() => {
				const row = screen.getByLabelText("Sign out");
				expect(row.props.accessibilityState.busy).toBe(true);
				// Announced as busy and actually refusing input — a spinner alone
				// would still let a second press through.
				expect(row.props.accessibilityState.disabled).toBe(true);
			});

			finish();
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
