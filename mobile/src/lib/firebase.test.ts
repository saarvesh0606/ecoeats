/**
 * How auth is initialised — the one detail of this module that has actually
 * broken in the field.
 *
 * `getAuth()` on native means in-memory persistence, so closing the app signed
 * the user out. Nothing on web can catch that: the browser build persists to
 * localStorage by itself, so the bug is invisible there by construction.
 */

const storage = {
	getItem: jest.fn(),
	setItem: jest.fn(),
	removeItem: jest.fn(),
};

interface AuthMocks {
	getAuth: jest.Mock;
	initializeAuth: jest.Mock;
	sendPasswordResetEmail: jest.Mock;
	getReactNativePersistence?: jest.Mock;
}

type FirebaseModule = typeof import("./firebase");

/**
 * Load a fresh copy of the module as a given platform. `native` decides whether
 * `firebase/auth` exposes `getReactNativePersistence` at all — the browser
 * bundle genuinely does not export it, and pretending otherwise would test a
 * module that ships nowhere.
 */
function loadAuth(os: "ios" | "web", initFails = false) {
	const mocks: AuthMocks = {
		getAuth: jest.fn(() => "auth-from-getAuth"),
		initializeAuth: jest.fn(() => {
			if (initFails) throw new Error("auth/already-initialized");
			return "auth-from-initializeAuth";
		}),
		sendPasswordResetEmail: jest.fn(async () => undefined),
	};
	if (os !== "web") {
		mocks.getReactNativePersistence = jest.fn(() => "rn-persistence");
	}

	let mod: FirebaseModule | undefined;
	jest.isolateModules(() => {
		jest.doMock("react-native", () => ({ Platform: { OS: os } }));
		jest.doMock("@react-native-async-storage/async-storage", () => ({
			__esModule: true,
			default: storage,
		}));
		jest.doMock("firebase/app", () => ({
			getApps: () => [],
			getApp: jest.fn(),
			initializeApp: jest.fn(() => "the-app"),
		}));
		jest.doMock("firebase/auth", () => mocks);
		mod = require("./firebase") as FirebaseModule;
	});

	return { auth: mod?.auth, mod: mod as FirebaseModule, mocks };
}

describe("firebase auth initialisation", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("persists the session on a device, so closing the app doesn't sign you out", () => {
		const { auth, mocks } = loadAuth("ios");

		expect(mocks.getReactNativePersistence).toHaveBeenCalledWith(storage);
		expect(mocks.initializeAuth).toHaveBeenCalledWith("the-app", {
			persistence: "rn-persistence",
		});
		expect(auth).toBe("auth-from-initializeAuth");
	});

	it("leaves the web build to its own storage", () => {
		// The browser bundle persists to localStorage unasked, and doesn't ship
		// getReactNativePersistence at all.
		const { auth, mocks } = loadAuth("web");

		expect(mocks.initializeAuth).not.toHaveBeenCalled();
		expect(mocks.getAuth).toHaveBeenCalledWith("the-app");
		expect(auth).toBe("auth-from-getAuth");
	});

	it("reuses the existing instance when the module re-runs", () => {
		// Fast Refresh re-executes this module; initializeAuth throws the second
		// time and the already-configured instance is the right answer.
		const { auth, mocks } = loadAuth("ios", true);

		expect(mocks.initializeAuth).toHaveBeenCalled();
		expect(auth).toBe("auth-from-getAuth");
	});
});

/**
 * The reset path's one real rule: it must not reveal whether an address has an
 * account. Firebase says so plainly with `auth/user-not-found`, and passing
 * that through would let anyone with the app work out who on campus is
 * registered by watching which addresses error.
 */
describe("sending a password reset", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("asks Firebase for a link", async () => {
		const { mod, mocks } = loadAuth("ios");

		await mod.sendPasswordReset("sun.devil@asu.edu");

		expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(
			"auth-from-initializeAuth",
			"sun.devil@asu.edu",
		);
	});

	it("resolves for an address Firebase has never seen", async () => {
		const { mod, mocks } = loadAuth("ios");
		mocks.sendPasswordResetEmail.mockRejectedValueOnce(
			Object.assign(new Error("no user"), { code: "auth/user-not-found" }),
		);

		// Resolving is the assertion: an unknown address has to be
		// indistinguishable from a known one all the way up to the screen.
		await expect(
			mod.sendPasswordReset("nobody@asu.edu"),
		).resolves.toBeUndefined();
	});

	it("still raises anything the user needs to act on", async () => {
		const { mod, mocks } = loadAuth("ios");
		mocks.sendPasswordResetEmail.mockRejectedValueOnce(
			Object.assign(new Error("slow down"), { code: "auth/too-many-requests" }),
		);

		// A rate limit is not a secret, and swallowing it would leave someone
		// pressing a button that silently does nothing.
		await expect(mod.sendPasswordReset("sun.devil@asu.edu")).rejects.toThrow(
			"slow down",
		);
	});
});
