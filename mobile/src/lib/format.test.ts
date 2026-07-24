import {
	formatDistance,
	formatLocation,
	formatTimeLeft,
	urgency,
} from "./format";

const NOW = 1_700_000_000_000;

function inMinutes(mins: number): string {
	return new Date(NOW + mins * 60_000).toISOString();
}

describe("formatTimeLeft", () => {
	it("says Expired once the deadline has passed", () => {
		expect(formatTimeLeft(inMinutes(-1), NOW)).toBe("Expired");
		expect(formatTimeLeft(inMinutes(0), NOW)).toBe("Expired");
	});

	it("counts down in seconds under a minute", () => {
		const in30s = new Date(NOW + 30_000).toISOString();
		expect(formatTimeLeft(in30s, NOW)).toBe("30s left");
	});

	it("counts down in minutes under an hour", () => {
		expect(formatTimeLeft(inMinutes(45), NOW)).toBe("45m left");
		expect(formatTimeLeft(inMinutes(1), NOW)).toBe("1m left");
	});

	it("shows hours and minutes past an hour", () => {
		expect(formatTimeLeft(inMinutes(90), NOW)).toBe("1h 30m left");
	});

	it("omits the minutes when it's a whole number of hours", () => {
		expect(formatTimeLeft(inMinutes(120), NOW)).toBe("2h left");
	});
});

describe("urgency", () => {
	it("is high within 5 minutes", () => {
		expect(urgency(inMinutes(3), NOW)).toBe("high");
		expect(urgency(inMinutes(5), NOW)).toBe("high");
	});
	it("is medium within 15 minutes", () => {
		expect(urgency(inMinutes(10), NOW)).toBe("medium");
		expect(urgency(inMinutes(15), NOW)).toBe("medium");
	});
	it("is low beyond 15 minutes", () => {
		expect(urgency(inMinutes(30), NOW)).toBe("low");
	});
});

describe("formatDistance", () => {
	it("passes null through (no location shared)", () => {
		expect(formatDistance(null)).toBeNull();
	});
	it("says Right here when almost on top of it", () => {
		expect(formatDistance(0.05)).toBe("Right here");
	});
	it("shows one decimal under a mile", () => {
		expect(formatDistance(0.3)).toBe("0.3 mi away");
	});
	it("rounds to whole miles beyond one", () => {
		expect(formatDistance(2.4)).toBe("2 mi away");
	});
});

describe("formatLocation", () => {
	it("includes the room when present", () => {
		expect(formatLocation("Wrigley Hall", "205")).toBe("Wrigley Hall, Room 205");
	});
	it("omits the room when absent", () => {
		expect(formatLocation("Hayden Library", null)).toBe("Hayden Library");
	});
});
