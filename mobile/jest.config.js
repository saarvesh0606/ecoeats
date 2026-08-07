/** Jest config for the Expo client. jest-expo handles the RN/Expo transform. */
module.exports = {
	preset: "jest-expo",
	setupFiles: ["<rootDir>/jest.setup.js"],
	// Testing Library's own async budget is separate from testTimeout below, and
	// is the tighter of the two. See the file for why it has to be raised.
	setupFilesAfterEnv: ["<rootDir>/jest.setup-after-env.js"],
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/src/$1",
	},
	testMatch: ["**/*.test.ts", "**/*.test.tsx"],
	// Jest's 5s default is a poor fit here. A screen suite mounts the real
	// navigation, animation and font stacks, and on a slower machine a handful of
	// tests blow the limit at random — a different handful each run, which reads
	// as a broken suite rather than a slow one.
	//
	// 60s rather than something tighter because the worst case is a cold Babel
	// transform cache, which is exactly what CI and a fresh clone always have: on
	// a clean install the first test in a suite paid enough transform cost to
	// blow 30s, then passed in single digits once the cache was warm. Nothing
	// here waits on anything that could genuinely hang — every fetch is mocked —
	// so a generous ceiling costs nothing and buys a trustworthy signal.
	testTimeout: 60_000,
};
