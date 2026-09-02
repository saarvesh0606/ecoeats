import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { sendPasswordReset } from "@/lib/firebase";
import { renderWithProviders } from "@/test-utils/render";
import { ForgotPasswordScreen } from "./ForgotPassword";

jest.mock("@/lib/firebase", () => ({
	sendPasswordReset: jest.fn(),
	authErrorMessage: (err: unknown) =>
		err instanceof Error ? err.message : "Something went wrong.",
}));

const mockReplace = jest.fn();
let mockParams: { email?: string } = {};
jest.mock("expo-router", () => ({
	useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
	useLocalSearchParams: () => mockParams,
}));

const mockSend = sendPasswordReset as jest.MockedFunction<
	typeof sendPasswordReset
>;

/** Fill the address field and press send. */
async function send(address: string) {
	fireEvent.changeText(screen.getByLabelText("Email"), address);
	fireEvent.press(screen.getByText("Send reset link"));
	await waitFor(() => expect(mockSend).toHaveBeenCalled());
}

describe("ForgotPasswordScreen", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockParams = {};
		mockSend.mockResolvedValue(undefined);
	});

	it("starts with the address carried over from the sign-in form", () => {
		mockParams = { email: "sam.rivera@gmail.com" };
		renderWithProviders(<ForgotPasswordScreen />);

		expect(screen.getByLabelText("Email").props.value).toBe(
			"sam.rivera@gmail.com",
		);
	});

	it("holds a reset to the same address rule as signing up", async () => {
		// Shape, not domain — both screens run the same validateEmail, and
		// neither has a domain rule to enforce any more.
		renderWithProviders(<ForgotPasswordScreen />);
		fireEvent.changeText(screen.getByLabelText("Email"), "someone-at-gmail");
		fireEvent.press(screen.getByText("Send reset link"));

		expect(await screen.findByText(/doesn't look right/i)).toBeTruthy();
		expect(mockSend).not.toHaveBeenCalled();
	});

	it("sends to the trimmed, lowercased address", async () => {
		renderWithProviders(<ForgotPasswordScreen />);
		await send("  Sam.Rivera@GMAIL.com  ");

		expect(mockSend).toHaveBeenCalledWith("sam.rivera@gmail.com");
	});

	it("confirms without saying whether the account exists", async () => {
		// The wording is the security property, not politeness. If this screen
		// ever says "we sent a link to X" for a real address and something else
		// for an unknown one, it becomes a way to enumerate who has an account.
		renderWithProviders(<ForgotPasswordScreen />);
		await send("sam.rivera@gmail.com");

		expect(await screen.findByText(/If an account exists/)).toBeTruthy();
		// Echoed back all the same, because the neutral wording gives no other
		// clue that the address was mistyped.
		expect(screen.getByText("sam.rivera@gmail.com")).toBeTruthy();
	});

	it("warns about the spam folder", async () => {
		// Same sender as the verification mail, so the same fate: Gmail files it
		// as spam and university gateways quarantine it. Pinned so it survives
		// until custom SMTP makes it untrue.
		renderWithProviders(<ForgotPasswordScreen />);
		await send("sam.rivera@gmail.com");

		expect(await screen.findByText(/spam or junk folder/)).toBeTruthy();
	});

	it("surfaces the reason a send failed", async () => {
		mockSend.mockRejectedValueOnce(new Error("Too many attempts."));
		renderWithProviders(<ForgotPasswordScreen />);
		await send("sam.rivera@gmail.com");

		expect(await screen.findByText("Too many attempts.")).toBeTruthy();
		expect(screen.queryByText(/If an account exists/)).toBeNull();
	});

	it("can send again from the confirmation", async () => {
		renderWithProviders(<ForgotPasswordScreen />);
		await send("sam.rivera@gmail.com");

		fireEvent.press(screen.getByText("Send it again"));

		await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(2));
		expect(mockSend).toHaveBeenLastCalledWith("sam.rivera@gmail.com");
	});

	it("goes back to the form with the address kept, for a typo", async () => {
		renderWithProviders(<ForgotPasswordScreen />);
		await send("sam.rivera@gmail.com");

		fireEvent.press(screen.getByText("Use a different address"));

		expect(screen.getByLabelText("Email").props.value).toBe(
			"sam.rivera@gmail.com",
		);
	});

	it("returns to sign in by replacing, not by going back", () => {
		// This route is reachable with nothing beneath it on the stack, where
		// back() would go nowhere at all.
		renderWithProviders(<ForgotPasswordScreen />);
		fireEvent.press(screen.getByText("Back to sign in"));

		expect(mockReplace).toHaveBeenCalledWith("/login");
	});
});
