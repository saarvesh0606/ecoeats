import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { resendVerification } from "@/lib/firebase";
import { renderWithProviders } from "@/test-utils/render";
import VerifyEmailScreen from "../../app/(auth)/verify-email";

jest.mock("@/lib/firebase", () => ({
	resendVerification: jest.fn(),
	authErrorMessage: (err: unknown) =>
		err instanceof Error ? err.message : "Something went wrong.",
}));

const mockRefresh = jest.fn();
const mockSignOut = jest.fn();
jest.mock("@/context/AuthContext", () => ({
	useAuth: () => ({
		firebaseUser: { email: "sun.devil@asu.edu" },
		refresh: mockRefresh,
		signOut: mockSignOut,
	}),
}));

const mockResend = resendVerification as jest.MockedFunction<
	typeof resendVerification
>;

describe("VerifyEmailScreen", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockResend.mockResolvedValue(undefined);
	});

	it("says which address it wrote to", () => {
		renderWithProviders(<VerifyEmailScreen />);
		expect(screen.getByText("sun.devil@asu.edu")).toBeTruthy();
	});

	it("warns about the spam folder before anything has gone wrong", () => {
		// Not decoration. Firebase sends from noreply@<project>.firebaseapp.com,
		// a shared domain with poor sender reputation — Gmail was confirmed to
		// file it as spam. Telling people only after they press Resend means
		// everyone waits for a mail that already arrived, in a folder nobody
		// checked. Pinned so it can't be tidied away before custom SMTP exists.
		renderWithProviders(<VerifyEmailScreen />);
		expect(screen.getByText(/spam or junk folder/)).toBeTruthy();
	});

	it("resends and confirms it did", async () => {
		renderWithProviders(<VerifyEmailScreen />);
		fireEvent.press(screen.getByText("Resend the email"));

		await waitFor(() => expect(mockResend).toHaveBeenCalledTimes(1));
		expect(await screen.findByText(/Check your inbox/)).toBeTruthy();
	});

	it("surfaces the reason a resend failed", async () => {
		mockResend.mockRejectedValue(new Error("Too many requests. Try later."));
		renderWithProviders(<VerifyEmailScreen />);

		fireEvent.press(screen.getByText("Resend the email"));

		expect(
			await screen.findByText("Too many requests. Try later."),
		).toBeTruthy();
	});

	it("re-checks verification on demand and says when it still isn't done", async () => {
		renderWithProviders(<VerifyEmailScreen />);
		fireEvent.press(screen.getByText("I've verified — continue"));

		await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
		// Reaching this line at all means the gate kept us here, so the screen
		// has to say so rather than look like the button did nothing.
		expect(await screen.findByText(/Not verified yet/)).toBeTruthy();
	});

	it("offers a way out to a different account", () => {
		renderWithProviders(<VerifyEmailScreen />);
		fireEvent.press(screen.getByText("Use a different account"));
		expect(mockSignOut).toHaveBeenCalledTimes(1);
	});
});
