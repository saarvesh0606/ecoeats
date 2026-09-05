import { scopeParams } from "@/lib/listingStream";

// Importing the module reaches api -> firebase -> AsyncStorage, none of which
// this pure function touches. Mocked so the test stays about the parameters.
jest.mock("@/lib/api", () => ({ currentBearerToken: jest.fn() }));
jest.mock("react-native-sse", () => ({ __esModule: true, default: jest.fn() }));

/**
 * What the stream asks the server to send it. Getting this wrong is quiet in
 * the worst way: too narrow and listings go missing from a live feed, which
 * looks exactly like nothing being posted.
 */
describe("scopeParams", () => {
	it("asks for everything when there is no scope", () => {
		expect(scopeParams(undefined)).toEqual([]);
		expect(scopeParams({})).toEqual([]);
	});

	it("narrows a host's dashboard to its own listings", () => {
		expect(scopeParams({ mine: true })).toEqual(["mine=true"]);
	});

	it("prefers mine over a circle, rather than sending both", () => {
		// A dashboard wants its own listings wherever they are. Sending the
		// circle as well would be the server's problem to resolve, and the
		// answer it picks is not this file's to assume.
		expect(
			scopeParams({ mine: true, lat: 33.42, lng: -111.93, radiusMiles: 5 }),
		).toEqual(["mine=true"]);
	});

	it("sends a circle when it has all three parts", () => {
		expect(scopeParams({ lat: 33.42, lng: -111.93, radiusMiles: 5 })).toEqual([
			"lat=33.42",
			"lng=-111.93",
			"radius_miles=5",
		]);
	});

	it("sends nothing when the circle is incomplete", () => {
		// The server ignores a partial circle rather than rejecting it, so a
		// half-sent one would look like it worked while narrowing nothing.
		expect(scopeParams({ lat: 33.42, lng: -111.93 })).toEqual([]);
		expect(scopeParams({ lat: 33.42, radiusMiles: 5 })).toEqual([]);
		expect(scopeParams({ radiusMiles: 5 })).toEqual([]);
	});

	it("keeps a zero coordinate, which is a real place", () => {
		// Guarding with a falsy check instead of an undefined one would drop
		// the equator and the prime meridian.
		expect(scopeParams({ lat: 0, lng: 0, radiusMiles: 5 })).toEqual([
			"lat=0",
			"lng=0",
			"radius_miles=5",
		]);
	});
});
