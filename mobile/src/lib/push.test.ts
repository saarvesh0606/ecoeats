import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import { registerForPush, unregisterForPush } from "./push";

// Both of these have to vary per test, and a jest.mock factory may only close
// over `mock`-prefixed variables — hence the names and the getters.
let mockIsDevice = true;
let mockProjectId: string | null = "proj-1";

jest.mock("@/lib/api", () =>
	jest.requireActual("@/test-utils/render").apiModuleMock(),
);
jest.mock("expo-device", () => ({
	get isDevice() {
		return mockIsDevice;
	},
}));
jest.mock("expo-notifications", () => ({
	getPermissionsAsync: jest.fn(),
	requestPermissionsAsync: jest.fn(),
	getExpoPushTokenAsync: jest.fn(),
	setNotificationChannelAsync: jest.fn(),
	AndroidImportance: { DEFAULT: 3 },
}));
jest.mock("expo-constants", () => ({
	default: {
		get expoConfig() {
			return { extra: { eas: { projectId: mockProjectId } } };
		},
	},
}));

const TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";

const mockGetPermissions =
	Notifications.getPermissionsAsync as jest.MockedFunction<
		typeof Notifications.getPermissionsAsync
	>;
const mockAskPermissions =
	Notifications.requestPermissionsAsync as jest.MockedFunction<
		typeof Notifications.requestPermissionsAsync
	>;
const mockGetToken = Notifications.getExpoPushTokenAsync as jest.MockedFunction<
	typeof Notifications.getExpoPushTokenAsync
>;

const realOS = Object.getOwnPropertyDescriptor(Platform, "OS");
function on(os: "ios" | "android" | "web") {
	Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

beforeEach(() => {
	jest.clearAllMocks();
	on("ios");
	mockIsDevice = true;
	mockProjectId = "proj-1";
	mockGetToken.mockResolvedValue({ data: TOKEN } as never);
});

afterEach(() => {
	if (realOS) Object.defineProperty(Platform, "OS", realOS);
});

describe("registering", () => {
	it("hands the token to the API once permission is granted", async () => {
		mockGetPermissions.mockResolvedValue({
			granted: true,
			canAskAgain: true,
		} as never);

		await expect(registerForPush()).resolves.toBe(TOKEN);
		expect(api.post).toHaveBeenCalledWith("/devices", {
			token: TOKEN,
			platform: "ios",
		});
	});

	it("asks only when it hasn't already been granted", async () => {
		mockGetPermissions.mockResolvedValue({
			granted: true,
			canAskAgain: true,
		} as never);

		await registerForPush();

		expect(mockAskPermissions).not.toHaveBeenCalled();
	});

	it("does not re-prompt someone who already said no", async () => {
		// The OS won't show the dialog a second time anyway; asking is futile
		// and reads as nagging.
		mockGetPermissions.mockResolvedValue({
			granted: false,
			canAskAgain: false,
		} as never);

		await expect(registerForPush()).resolves.toBeNull();
		expect(mockAskPermissions).not.toHaveBeenCalled();
		expect(api.post).not.toHaveBeenCalled();
	});

	it("creates the Android channel, without which nothing is delivered", async () => {
		// Android drops notifications with no channel, and does it silently.
		on("android");
		mockGetPermissions.mockResolvedValue({
			granted: true,
			canAskAgain: true,
		} as never);

		await registerForPush();

		expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
			"default",
			expect.objectContaining({ name: "EcoEats" }),
		);
	});
});

describe("when push can't work", () => {
	it("stays quiet on web, where Expo push has no transport", async () => {
		on("web");
		await expect(registerForPush()).resolves.toBeNull();
		expect(mockGetPermissions).not.toHaveBeenCalled();
	});

	it("stays quiet on a simulator, which has no token to give", async () => {
		mockIsDevice = false;
		await expect(registerForPush()).resolves.toBeNull();
		expect(mockGetPermissions).not.toHaveBeenCalled();
	});

	it("swallows a failure rather than spoiling a successful sign-in", async () => {
		// Registration runs straight after sign-in. Someone who has just got in
		// should never see this fail.
		mockGetPermissions.mockRejectedValue(new Error("boom"));
		await expect(registerForPush()).resolves.toBeNull();
	});

	it("is inert until the project has been linked to EAS", async () => {
		// getExpoPushTokenAsync cannot work without a projectId, and that only
		// exists once `eas init` has run. Before then push must be quietly
		// dormant rather than throwing on every sign-in.
		mockProjectId = null;
		mockGetPermissions.mockResolvedValue({
			granted: true,
			canAskAgain: true,
		} as never);

		await expect(registerForPush()).resolves.toBeNull();
		expect(mockGetToken).not.toHaveBeenCalled();
		expect(api.post).not.toHaveBeenCalled();
	});
});

describe("unregistering", () => {
	it("hands the token back", async () => {
		await unregisterForPush(TOKEN);
		expect(api.del).toHaveBeenCalledWith("/devices", { token: TOKEN });
	});

	it("does nothing without a token", async () => {
		await unregisterForPush(null);
		expect(api.del).not.toHaveBeenCalled();
	});

	it("never lets a network failure block signing out", async () => {
		(api.del as jest.Mock).mockRejectedValue(new Error("offline"));
		await expect(unregisterForPush(TOKEN)).resolves.toBeUndefined();
	});
});
