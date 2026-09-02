import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { requestAppleCredential } from "@/lib/appleAuth";
import { linkCredential, linkedProviders } from "@/lib/firebase";
import { SignInMethods } from "./SignInMethods";

jest.mock("@/lib/appleAuth", () => ({
	APPLE_CANCELLED: "ERR_REQUEST_CANCELED",
	appleSignInAvailable: jest.fn(async () => true),
	requestAppleCredential: jest.fn(),
}));

jest.mock("@/lib/firebase", () => ({
	APPLE_PROVIDER: "apple.com",
	GOOGLE_PROVIDER: "google.com",
	PASSWORD_PROVIDER: "password",
	appleCredential: jest.fn(() => ({ kind: "apple-credential" })),
	linkCredential: jest.fn(),
	linkedProviders: jest.fn(() => ["password"]),
	authErrorMessage: jest.fn(() => "That didn't work."),
}));

const providers = linkedProviders as jest.MockedFunction<typeof linkedProviders>;
const request = requestAppleCredential as jest.MockedFunction<
	typeof requestAppleCredential
>;
const link = linkCredential as jest.MockedFunction<typeof linkCredential>;

function withCode(message: string, code: string) {
	return Object.assign(new Error(message), { code });
}

beforeEach(() => {
	jest.clearAllMocks();
	providers.mockReturnValue(["password"]);
	request.mockResolvedValue({
		identityToken: "apple-token",
		rawNonce: "raw-nonce",
		fullName: null,
		authorizationCode: "code-123",
	});
});

async function renderMethods(onError = jest.fn(), onLinked = jest.fn()) {
	render(<SignInMethods onError={onError} onLinked={onLinked} />);
	await screen.findByText("Email and password");
	return { onError, onLinked };
}

describe("SignInMethods", () => {
	it("lists the ways in that the account already has", async () => {
		providers.mockReturnValue(["password", "google.com"]);
		await renderMethods();

		expect(screen.getByText("Email and password")).toBeTruthy();
		expect(screen.getByText("Google")).toBeTruthy();
	});

	it("offers Apple when it is not linked yet", async () => {
		await renderMethods();
		expect(await screen.findByText("Link Apple")).toBeTruthy();
	});

	it("does not offer Apple twice", async () => {
		providers.mockReturnValue(["password", "apple.com"]);
		await renderMethods();

		expect(screen.getByText("Apple")).toBeTruthy();
		expect(screen.queryByText("Link Apple")).toBeNull();
	});

	it("links the credential to the account already signed in", async () => {
		const { onLinked } = await renderMethods();

		fireEvent.press(await screen.findByText("Link Apple"));

		await waitFor(() =>
			expect(link).toHaveBeenCalledWith({ kind: "apple-credential" }),
		);
		expect(onLinked).toHaveBeenCalledWith("Apple");
	});

	it("explains when that Apple ID is already its own account", async () => {
		// The case linking cannot resolve: it may have its own listings and
		// claims, so it is reported rather than forced.
		link.mockRejectedValue(
			withCode("in use", "auth/credential-already-in-use"),
		);
		const { onError } = await renderMethods();

		fireEvent.press(await screen.findByText("Link Apple"));

		await waitFor(() =>
			expect(onError).toHaveBeenCalledWith(
				expect.stringContaining("already has its own EcoEats account"),
			),
		);
	});

	it("stays silent when the user backs out of Apple's sheet", async () => {
		request.mockRejectedValue(withCode("cancelled", "ERR_REQUEST_CANCELED"));
		const { onError, onLinked } = await renderMethods();

		fireEvent.press(await screen.findByText("Link Apple"));

		await waitFor(() => expect(request).toHaveBeenCalled());
		expect(onError).not.toHaveBeenCalledWith(expect.any(String));
		expect(onLinked).not.toHaveBeenCalled();
		expect(link).not.toHaveBeenCalled();
	});

	it("surfaces anything else that goes wrong", async () => {
		link.mockRejectedValue(withCode("nope", "auth/network-request-failed"));
		const { onError } = await renderMethods();

		fireEvent.press(await screen.findByText("Link Apple"));

		await waitFor(() =>
			expect(onError).toHaveBeenCalledWith("That didn't work."),
		);
	});
});
