import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { completeAppleSignIn } from "@/lib/firebase";
import { AppleSignInButton } from "./AppleSignInButton";

jest.mock("@/lib/firebase", () => ({
	completeAppleSignIn: jest.fn(),
	authErrorMessage: jest.fn(() => "That didn't work."),
}));

jest.mock("expo-apple-authentication", () => ({
	isAvailableAsync: jest.fn(),
	signInAsync: jest.fn(),
	AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

// A fixed nonce and a hash that is visibly derived from it, so a test can tell
// which of the two forms reached which side.
jest.mock("expo-crypto", () => ({
	randomUUID: () => "raw-nonce-1234",
	digestStringAsync: jest.fn(async (_alg: string, value: string) =>
		`sha256(${value})`,
	),
	CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

const isAvailable = AppleAuthentication.isAvailableAsync as jest.MockedFunction<
	typeof AppleAuthentication.isAvailableAsync
>;
const signInAsync = AppleAuthentication.signInAsync as jest.MockedFunction<
	typeof AppleAuthentication.signInAsync
>;
const complete = completeAppleSignIn as jest.MockedFunction<
	typeof completeAppleSignIn
>;

function appleReturns(overrides: Record<string, unknown> = {}) {
	signInAsync.mockResolvedValue({
		identityToken: "apple-id-token",
		fullName: null,
		...overrides,
	} as never);
}

async function renderAvailable() {
	isAvailable.mockResolvedValue(true);
	render(<AppleSignInButton onError={jest.fn()} />);
	await screen.findByText("Continue with Apple");
}

beforeEach(() => {
	jest.clearAllMocks();
	appleReturns();
});

describe("AppleSignInButton", () => {
	describe("when the OS cannot offer it", () => {
		it("renders nothing at all", async () => {
			isAvailable.mockResolvedValue(false);
			render(<AppleSignInButton onError={jest.fn()} />);

			await waitFor(() => expect(isAvailable).toHaveBeenCalled());
			expect(screen.queryByText("Continue with Apple")).toBeNull();
		});

		it("treats a failed availability check as unavailable", async () => {
			// Better a missing button than one that throws when pressed.
			isAvailable.mockRejectedValue(new Error("no such module"));
			render(<AppleSignInButton onError={jest.fn()} />);

			await waitFor(() => expect(isAvailable).toHaveBeenCalled());
			expect(screen.queryByText("Continue with Apple")).toBeNull();
		});
	});

	describe("the nonce", () => {
		it("gives Apple the hash and Firebase the raw value", async () => {
			// The single easiest thing to get backwards here, and it fails with an
			// opaque credential error rather than anything that names the nonce.
			await renderAvailable();

			fireEvent.press(screen.getByText("Continue with Apple"));

			await waitFor(() => expect(complete).toHaveBeenCalled());
			expect(signInAsync).toHaveBeenCalledWith(
				expect.objectContaining({ nonce: "sha256(raw-nonce-1234)" }),
			);
			expect(complete).toHaveBeenCalledWith(
				expect.objectContaining({ rawNonce: "raw-nonce-1234" }),
			);
		});
	});

	describe("the name Apple sends once", () => {
		it("passes both halves through on a first authorisation", async () => {
			appleReturns({ fullName: { givenName: "Sam", familyName: "Rivera" } });
			await renderAvailable();

			fireEvent.press(screen.getByText("Continue with Apple"));

			await waitFor(() =>
				expect(complete).toHaveBeenCalledWith(
					expect.objectContaining({ fullName: "Sam Rivera" }),
				),
			);
		});

		it("copes with only one half being present", async () => {
			appleReturns({ fullName: { givenName: "Sam", familyName: null } });
			await renderAvailable();

			fireEvent.press(screen.getByText("Continue with Apple"));

			await waitFor(() =>
				expect(complete).toHaveBeenCalledWith(
					expect.objectContaining({ fullName: "Sam" }),
				),
			);
		});

		it("sends null on every later sign-in, when Apple sends nothing", async () => {
			appleReturns({ fullName: null });
			await renderAvailable();

			fireEvent.press(screen.getByText("Continue with Apple"));

			await waitFor(() =>
				expect(complete).toHaveBeenCalledWith(
					expect.objectContaining({ fullName: null }),
				),
			);
		});
	});

	describe("when it does not go through", () => {
		it("stays silent when the user backs out", async () => {
			// Cancelling is a decision, not an error to shout about.
			const err = Object.assign(new Error("cancelled"), {
				code: "ERR_REQUEST_CANCELED",
			});
			signInAsync.mockRejectedValue(err);
			const onError = jest.fn();
			isAvailable.mockResolvedValue(true);
			render(<AppleSignInButton onError={onError} />);
			await screen.findByText("Continue with Apple");

			fireEvent.press(screen.getByText("Continue with Apple"));

			await waitFor(() => expect(signInAsync).toHaveBeenCalled());
			expect(onError).not.toHaveBeenCalledWith(expect.any(String));
			expect(complete).not.toHaveBeenCalled();
		});

		it("says so when Apple returns no identity token", async () => {
			appleReturns({ identityToken: null });
			const onError = jest.fn();
			isAvailable.mockResolvedValue(true);
			render(<AppleSignInButton onError={onError} />);
			await screen.findByText("Continue with Apple");

			fireEvent.press(screen.getByText("Continue with Apple"));

			await waitFor(() =>
				expect(onError).toHaveBeenCalledWith(
					"Apple didn't return a sign-in token. Try again.",
				),
			);
			expect(complete).not.toHaveBeenCalled();
		});

		it("surfaces a failure from the credential exchange", async () => {
			complete.mockRejectedValue(new Error("That account has been disabled."));
			const onError = jest.fn();
			isAvailable.mockResolvedValue(true);
			render(<AppleSignInButton onError={onError} />);
			await screen.findByText("Continue with Apple");

			fireEvent.press(screen.getByText("Continue with Apple"));

			await waitFor(() =>
				expect(onError).toHaveBeenCalledWith("That account has been disabled."),
			);
		});
	});
});
