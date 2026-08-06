/** Jest config for the Expo client. jest-expo handles the RN/Expo transform. */
module.exports = {
	preset: "jest-expo",
	setupFiles: ["<rootDir>/jest.setup.js"],
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/src/$1",
	},
	testMatch: ["**/*.test.ts", "**/*.test.tsx"],
	// Jest's 5s default is a poor fit here. A screen suite mounts the real
	// navigation, animation and font stacks, and on a slower machine a handful of
	// tests blow the limit at random — a different handful each run, which reads
	// as a broken suite rather than a slow one. The tests themselves are not
	// waiting on anything that could hang; every fetch is mocked.
	testTimeout: 30_000,
};
