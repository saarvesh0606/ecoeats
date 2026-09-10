import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { fetchProfile, ProfileNotFoundError } from "@/lib/api";
import { watchAuth } from "@/lib/firebase";
import { AuthProvider, useAuth } from "./AuthContext";

// The real classes, so `instanceof` in the provider means what it means in
// production — a hand-rolled stand-in would pass the test and miss the bug.
jest.mock("@/lib/api", () => {
	class ApiError extends Error {
		status: number;
		constructor(message: string, status: number) {
			super(message);
			this.status = status;
		}
	}
	class ProfileNotFoundError extends ApiError {}
	return { fetchProfile: jest.fn(), ApiError, ProfileNotFoundError };
});

jest.mock("@/lib/firebase", () => ({
	watchAuth: jest.fn(() => () => {}),
	reloadUser: jest.fn(),
	signOut: jest.fn(),
}));
jest.mock("@/lib/haptics", () => ({ applyHapticPreference: jest.fn() }));
jest.mock("@/lib/preferences", () => ({
	areHapticsMuted: jest.fn().mockResolvedValue(false),
	arePushNotificationsMuted: jest.fn().mockResolvedValue(false),
	setPushNotificationsMuted: jest.fn(),
}));
jest.mock("@/lib/push", () => ({
	registerForPush: jest.fn().mockResolvedValue(null),
	unregisterForPush: jest.fn(),
}));
jest.mock("@/lib/session", () => ({
	getDevToken: () => null,
	setDevToken: jest.fn(),
}));

const mockFetchProfile = fetchProfile as jest.MockedFunction<
	typeof fetchProfile
>;

function ShowStatus() {
	const { status } = useAuth();
	return <Text testID="status">{status}</Text>;
}

/** Drive the provider as Firebase would: a signed-in, verified user. */
async function signIn() {
	render(
		<AuthProvider>
			<ShowStatus />
		</AuthProvider>,
	);
	const onAuth = (watchAuth as jest.Mock).mock.calls[0][0];
	await act(async () => {
		await onAuth({ uid: "u1", email: "sam@gmail.com", emailVerified: true });
	});
}

const statusText = () => screen.getByTestId("status").props.children;

describe("AuthContext — loading the profile", () => {
	beforeEach(() => jest.clearAllMocks());

	it("is ready once the profile loads", async () => {
		mockFetchProfile.mockResolvedValue({
			id: "1",
			role: "recipient",
			terms_current: true,
		} as never);

		await signIn();

		await waitFor(() => expect(statusText()).toBe("ready"));
	});

	it("sends a genuinely new account to role selection", async () => {
		mockFetchProfile.mockRejectedValue(
			new ProfileNotFoundError("No profile", 404),
		);

		await signIn();

		await waitFor(() => expect(statusText()).toBe("needs-profile"));
	});

	it("retries a transient failure instead of giving up", async () => {
		// The production case: one dropped connection, fine on the next try.
		mockFetchProfile
			.mockRejectedValueOnce(new Error("Connection lost"))
			.mockResolvedValue({
				id: "1",
				role: "organizer",
				terms_current: true,
			} as never);

		await signIn();

		await waitFor(() => expect(statusText()).toBe("ready"));
		expect(mockFetchProfile).toHaveBeenCalledTimes(2);
	});

	it("never sends an established account to role selection on a 5xx", async () => {
		// THE REGRESSION. A 500 used to be treated as "no profile yet", which
		// routed an existing user to role selection — where creating the
		// profile they already have answers 409 and strands them.
		mockFetchProfile.mockRejectedValue(new Error("Internal server error"));

		await signIn();

		await waitFor(() => expect(statusText()).toBe("profile-unavailable"), {
			timeout: 8000,
		});
		expect(statusText()).not.toBe("needs-profile");
	}, 15000);
});
