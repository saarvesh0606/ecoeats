import { Linking, Platform } from "react-native";
import { directionsUrl, openDirections } from "./maps";

const realOS = Object.getOwnPropertyDescriptor(Platform, "OS");

/** Pretend to be a given platform for the duration of one test. */
function on(os: "ios" | "android" | "web") {
	Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

afterEach(() => {
	if (realOS) Object.defineProperty(Platform, "OS", realOS);
	jest.restoreAllMocks();
});

describe("which map opens", () => {
	it("sends an iPhone to Apple Maps", () => {
		on("ios");
		const url = directionsUrl(33.4, -111.9, "Wrigley Hall");
		expect(url).toContain("https://maps.apple.com/");
		expect(url).toContain("daddr=33.4,-111.9");
		expect(url).not.toContain("google");
	});

	it("sends Android to Google Maps", () => {
		on("android");
		const url = directionsUrl(33.4, -111.9, "Wrigley Hall");
		expect(url).toContain("https://www.google.com/maps/dir/");
		expect(url).toContain("destination=33.4,-111.9");
		expect(url).not.toContain("apple");
	});

	it("treats web as Google, since there is no Apple Maps on the web", () => {
		on("web");
		expect(directionsUrl(33.4, -111.9)).toContain("google.com/maps");
	});
});

describe("how it asks for directions", () => {
	it("asks for walking, not driving", () => {
		// Surplus food is a few minutes away on a campus you're already standing
		// on. Driving directions to the next building would be absurd, and the
		// walking route uses paths a car can't.
		on("ios");
		expect(directionsUrl(33.4, -111.9)).toContain("dirflg=w");
		on("android");
		expect(directionsUrl(33.4, -111.9)).toContain("travelmode=walking");
	});

	it("never uses a custom scheme, which would need declaring and can dead-end", () => {
		// maps:// and geo: require an LSApplicationQueriesSchemes entry before iOS
		// will admit they exist, and fail outright with no app installed. An https
		// link hands off to the app when there is one and opens the web map
		// otherwise.
		for (const os of ["ios", "android", "web"] as const) {
			on(os);
			expect(directionsUrl(1, 2, "x")).toMatch(/^https:\/\//);
		}
	});

	it("escapes a label rather than breaking the URL with it", () => {
		on("ios");
		const url = directionsUrl(33.4, -111.9, "Wrigley Hall, Room 205");
		expect(url).toContain("q=Wrigley%20Hall%2C%20Room%20205");
	});

	it("omits the label entirely when there isn't one", () => {
		on("ios");
		expect(directionsUrl(33.4, -111.9)).not.toContain("q=");
		expect(directionsUrl(33.4, -111.9, null)).not.toContain("q=");
	});

	it("keeps full coordinate precision", () => {
		// Rounding a campus pickup to 2dp can put the pin on the wrong building.
		on("android");
		expect(directionsUrl(33.419912, -111.933223)).toContain(
			"destination=33.419912,-111.933223",
		);
	});
});

describe("openDirections", () => {
	it("opens the link and reports success", async () => {
		on("ios");
		const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);

		await expect(openDirections(33.4, -111.9, "Wrigley Hall")).resolves.toBe(
			true,
		);
		expect(open).toHaveBeenCalledWith(
			expect.stringContaining("https://maps.apple.com/"),
		);
	});

	it("reports failure instead of throwing, so the caller can say something", async () => {
		// A rejected openURL used to be an unhandled rejection; the button would
		// simply appear dead.
		on("android");
		jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));

		await expect(openDirections(33.4, -111.9)).resolves.toBe(false);
	});
});
