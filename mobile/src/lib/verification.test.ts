/**
 * The stale-token trap, found on a real device.
 *
 * Verify by email, tap the link, come back, pick a role — and the app says
 * "confirm your email address" about an account that is verified.
 *
 * The cause: `reload()` refreshes the local user object, so `emailVerified`
 * flips and the app moves on, but it leaves the cached ID token alone and
 * Firebase holds that for up to an hour. The API only ever reads the token.
 * Both sides were right about what they could see.
 */

// `mock`-prefixed so jest allows the factories below to close over them.
const mockReload = jest.fn();
const mockGetIdToken = jest.fn();
const mockState: { user: unknown } = { user: null };

jest.mock("firebase/app", () => ({
	getApp: jest.fn(),
	getApps: () => [{}],
	initializeApp: jest.fn(),
}));

jest.mock("firebase/auth", () => {
	const authObject = {
		get currentUser() {
			return mockState.user;
		},
	};
	return {
		getAuth: () => authObject,
		initializeAuth: () => authObject,
		getReactNativePersistence: jest.fn(),
		browserLocalPersistence: {},
		indexedDBLocalPersistence: {},
		onAuthStateChanged: jest.fn(),
		signOut: jest.fn(),
		GoogleAuthProvider: class {},
		OAuthProvider: class {},
		signInWithCredential: jest.fn(),
		signInWithPopup: jest.fn(),
		signInWithEmailAndPassword: jest.fn(),
		createUserWithEmailAndPassword: jest.fn(),
		sendEmailVerification: jest.fn(),
		sendPasswordResetEmail: jest.fn(),
		updateProfile: jest.fn(),
		linkWithCredential: jest.fn(),
	};
});

jest.mock("@react-native-async-storage/async-storage", () => ({}));

// Static, not dynamic: jest.mock is hoisted above imports, and this
// project's jest has no ESM dynamic-import support.
import { refreshIdToken, reloadUser } from "./firebase";

beforeEach(() => {
	jest.clearAllMocks();
	mockState.user = { reload: mockReload, getIdToken: mockGetIdToken };
	mockGetIdToken.mockResolvedValue("fresh-token");
});

describe("reloadUser", () => {
	it("forces a new ID token, not just a user reload", async () => {
		// The whole bug in one assertion. Without the `true`, the API keeps
		// seeing email_verified: false for up to an hour after verifying.
		await reloadUser();

		expect(mockReload).toHaveBeenCalled();
		expect(mockGetIdToken).toHaveBeenCalledWith(true);
	});

	it("does nothing when nobody is signed in", async () => {
		mockState.user = null;
		expect(await reloadUser()).toBeNull();
		expect(mockReload).not.toHaveBeenCalled();
	});
});

describe("refreshIdToken", () => {
	it("bypasses the cache", async () => {
		expect(await refreshIdToken()).toBe("fresh-token");
		expect(mockGetIdToken).toHaveBeenCalledWith(true);
	});

	it("returns null with nobody signed in", async () => {
		mockState.user = null;
		expect(await refreshIdToken()).toBeNull();
	});
});
