/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: "class",
	content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
	presets: [require("nativewind/preset")],
	theme: {
		extend: {
			colors: {
				forest: {
					DEFAULT: "#1B4332",
					50: "#f0faf4",
					100: "#dcf5e7",
					200: "#bbead0",
					300: "#86d6ad",
					400: "#52b788",
					500: "#2d9163",
					600: "#1e7450",
					700: "#1B4332",
					800: "#163827",
					900: "#0f2a1d",
				},
				lime: {
					DEFAULT: "#52B788",
					accent: "#74C69D",
				},
				cream: "#F8F6F0",
			},
			fontFamily: {
				display: ["Syne", "sans-serif"],
				body: ["DM Sans", "sans-serif"],
			},
			borderRadius: {
				card: "16px",
				btn: "14px",
			},
		},
	},
	plugins: [],
};
