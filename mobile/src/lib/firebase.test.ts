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
	getReactNativePersistence?: jest.Mock;
}

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
	};
	if (os !== "web") {
		mocks.getReactNativePersistence = jest.fn(() => "rn-persistence");
	}

	let auth: unknown;
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
		auth = (require("./firebase") as { auth: unknown }).auth;
	});

	return { auth, mocks };
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
