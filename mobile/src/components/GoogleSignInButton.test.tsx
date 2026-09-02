import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import {
	completeGoogleSignIn,
	signInWithGoogle,
} from "@/lib/firebase";
import { GoogleSignInButton } from "./GoogleSignInButton";

jest.mock("@/lib/firebase", () => ({
	signInWithGoogle: jest.fn(),
	completeGoogleSignIn: jest.fn(),
	authErrorMessage: jest.fn(() => "That didn't work."),
}));

// The provider is stubbed rather than mocked per-test so its response can be
// steered: native sign-in finishes through this value, not through a promise.
let mockResponse: unknown = null;
const mockPrompt = jest.fn();
jest.mock("expo-auth-session/providers/google", () => ({
	useIdTokenAuthRequest: () => [null, mockResponse, mockPrompt],
}));

jest.mock("expo-web-browser", () => ({ maybeCompleteAuthSession: jest.fn() }));

const mockPopup = signInWithGoogle as jest.MockedFunction<
	typeof signInWithGoogle
>;
const mockComplete = completeGoogleSignIn as jest.MockedFunction<
	typeof completeGoogleSignIn
>;

/**
 * Steer the platform per test.
 *
 * The two branches of this component are genuinely different code paths — a
 * popup that resolves versus a browser that answers through a response object —
 * so both have to be exercised, and under Jest the platform is whatever this
 * says. Platform.OS is a plain writable property; a defineProperty getter does
 * not take here.
 */
function onPlatform(os: "web" | "ios") {
	(Platform as unknown as { OS: string }).OS = os;
}

describe("GoogleSignInButton", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockResponse = null;
		mockPopup.mockResolvedValue(undefined);
		mockComplete.mockResolvedValue(undefined);
	});

	afterAll(() => onPlatform("ios"));

	describe("on web", () => {
		beforeEach(() => onPlatform("web"));

		it("signs in through the popup", async () => {
			render(<GoogleSignInButton onError={jest.fn()} />);
			fireEvent.press(screen.getByText("Continue with Google"));
			await waitFor(() => expect(mockPopup).toHaveBeenCalled());
		});

		it("stays quiet when the popup is simply dismissed", async () => {
			// A closed popup is a decision, not an error worth shouting about.
			mockPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });
			const onError = jest.fn();
			render(<GoogleSignInButton onError={onError} />);

			fireEvent.press(screen.getByText("Continue with Google"));

			await waitFor(() => expect(mockPopup).toHaveBeenCalled());
			// Cleared on press, never set to a message.
			expect(onError).not.toHaveBeenCalledWith(expect.any(String));
		});

		it("passes a readable rejection through unflattened", async () => {
			// A message that already reads well must survive the translator
			// rather than being replaced with a generic one.
			mockPopup.mockRejectedValue(
				new Error("That account has been disabled."),
			);
			const onError = jest.fn();
			render(<GoogleSignInButton onError={onError} />);

			fireEvent.press(screen.getByText("Continue with Google"));

			await waitFor(() =>
				expect(onError).toHaveBeenCalledWith("That account has been disabled."),
			);
		});
	});

	describe("on a phone", () => {
		beforeEach(() => onPlatform("ios"));

		it("opens the browser rather than a popup", () => {
			render(<GoogleSignInButton onError={jest.fn()} />);
			fireEvent.press(screen.getByText("Continue with Google"));

			expect(mockPrompt).toHaveBeenCalled();
			// There is no popup on a phone; reaching for one would hang the button.
			expect(mockPopup).not.toHaveBeenCalled();
		});

		it("exchanges the returned token with Firebase", async () => {
			mockResponse = { type: "success", params: { id_token: "tok-123" } };
			render(<GoogleSignInButton onError={jest.fn()} />);

			await waitFor(() => expect(mockComplete).toHaveBeenCalledWith("tok-123"));
		});

		it("says so when Google comes back without a token", async () => {
			mockResponse = { type: "success", params: {} };
			const onError = jest.fn();
			render(<GoogleSignInButton onError={onError} />);

			await waitFor(() =>
				expect(onError).toHaveBeenCalledWith(
					"Google didn't return a sign-in token. Try again.",
				),
			);
			expect(mockComplete).not.toHaveBeenCalled();
		});

		it("surfaces a failure from the token exchange", async () => {
			// This used to assert a domain rejection: the token's email claim was
			// read and refused before it ever reached Firebase. That rule is gone
			// — any verified address is accepted — but the path it rode still
			// matters, because an exchange can fail for other reasons and the
			// button must not swallow it and sit there looking successful.
			const payload = Buffer.from(
				JSON.stringify({ email: "someone@gmail.com" }),
			).toString("base64url");
			mockResponse = {
				type: "success",
				params: { id_token: `header.${payload}.signature` },
			};
			mockComplete.mockRejectedValue(
				new Error("That account has been disabled."),
			);
			const onError = jest.fn();
			render(<GoogleSignInButton onError={onError} />);

			await waitFor(() =>
				expect(onError).toHaveBeenCalledWith("That account has been disabled."),
			);
		});

		it("stays quiet when the browser is dismissed", async () => {
			mockResponse = { type: "dismiss" };
			const onError = jest.fn();
			render(<GoogleSignInButton onError={onError} />);

			await waitFor(() => expect(mockComplete).not.toHaveBeenCalled());
			expect(onError).not.toHaveBeenCalledWith(expect.any(String));
		});
	});
});
