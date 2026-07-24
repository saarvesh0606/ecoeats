/** Jest config for the Expo client. jest-expo handles the RN/Expo transform. */
module.exports = {
	preset: "jest-expo",
	setupFiles: ["<rootDir>/jest.setup.js"],
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/src/$1",
	},
	testMatch: ["**/*.test.ts", "**/*.test.tsx"],
};
