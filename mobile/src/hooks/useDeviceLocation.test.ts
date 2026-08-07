import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";
import { useDeviceLocation } from "./useDeviceLocation";

jest.mock("expo-location", () => ({
	requestForegroundPermissionsAsync: jest.fn(),
	getCurrentPositionAsync: jest.fn(),
	Accuracy: { Balanced: 3, High: 4 },
}));

const mockPermission =
	Location.requestForegroundPermissionsAsync as jest.MockedFunction<
		typeof Location.requestForegroundPermissionsAsync
	>;
const mockPosition = Location.getCurrentPositionAsync as jest.MockedFunction<
	typeof Location.getCurrentPositionAsync
>;

function allow() {
	mockPermission.mockResolvedValue({ granted: true } as never);
	mockPosition.mockResolvedValue({
		coords: { latitude: 33.4212, longitude: -111.9327 },
	} as never);
}

beforeEach(() => jest.clearAllMocks());

describe("when the user allows it", () => {
	it("reports the coordinates", async () => {
		allow();
		const { result } = renderHook(() => useDeviceLocation());

		await act(async () => {
			await result.current.request();
		});

		expect(result.current.coords).toEqual({ lat: 33.4212, lng: -111.9327 });
		expect(result.current.status).toBe("granted");
	});

	it("asks on mount only when told to", async () => {
		allow();
		renderHook(() => useDeviceLocation());
		expect(mockPermission).not.toHaveBeenCalled();

		renderHook(() => useDeviceLocation({ auto: true }));
		await waitFor(() => expect(mockPermission).toHaveBeenCalledTimes(1));
	});
});

describe("when it can't have a location", () => {
	it("stays usable after a refusal, with no coordinates and no throw", async () => {
		// The governing rule: location is an enhancement, never a gate. A refusal
		// must leave every caller able to carry on.
		mockPermission.mockResolvedValue({ granted: false } as never);
		const { result } = renderHook(() => useDeviceLocation());

		let returned: unknown;
		await act(async () => {
			returned = await result.current.request();
		});

		expect(returned).toBeNull();
		expect(result.current.coords).toBeNull();
		expect(result.current.status).toBe("denied");
		expect(mockPosition).not.toHaveBeenCalled();
	});

	it("survives a permission that resolves but a fix that never comes", async () => {
		// Common indoors, and on the web on any non-HTTPS origin.
		mockPermission.mockResolvedValue({ granted: true } as never);
		mockPosition.mockRejectedValue(new Error("no fix"));
		const { result } = renderHook(() => useDeviceLocation());

		let returned: unknown;
		await act(async () => {
			returned = await result.current.request();
		});

		expect(returned).toBeNull();
		expect(result.current.status).toBe("unavailable");
	});
});

describe("the in-flight guard", () => {
	it("does not open a second permission dialog over the first", async () => {
		allow();
		const { result } = renderHook(() => useDeviceLocation());

		await act(async () => {
			await Promise.all([result.current.request(), result.current.request()]);
		});

		expect(mockPermission).toHaveBeenCalledTimes(1);
	});
});

describe("accuracy", () => {
	it("defaults to Balanced, which is enough to say how far away something is", async () => {
		allow();
		const { result } = renderHook(() => useDeviceLocation());
		await act(async () => {
			await result.current.request();
		});
		expect(mockPosition).toHaveBeenCalledWith({ accuracy: 3 });
	});

	it("takes a better fix when the caller needs one", async () => {
		// Posting defines where people will actually walk to.
		allow();
		const { result } = renderHook(() =>
			useDeviceLocation({ accuracy: Location.Accuracy.High }),
		);
		await act(async () => {
			await result.current.request();
		});
		expect(mockPosition).toHaveBeenCalledWith({ accuracy: 4 });
	});
});
