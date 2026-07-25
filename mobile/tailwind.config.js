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
				// ASU brand. Maroon is the primary mark colour; gold is the ASU
				// accent, with a muted bronze for the editorial subtitle rule.
				maroon: {
					DEFAULT: "#8C1D40",
					50: "#f7e9ee",
					600: "#7a1938",
					700: "#6b1230",
				},
				gold: {
					DEFAULT: "#FFC627",
					muted: "#B08D3F",
				},
				cream: "#F8F6F0",
			},
			// Editorial pairing: Playfair Display (serif) for headings, DM Sans for
			// body. Weight variants are explicit families because custom fonts do
			// not synthesise weight on native — use font-display-bold etc.
			fontFamily: {
				display: ["PlayfairDisplay_600SemiBold"],
				"display-medium": ["PlayfairDisplay_500Medium"],
				"display-bold": ["PlayfairDisplay_700Bold"],
				body: ["DMSans_400Regular"],
				"body-medium": ["DMSans_500Medium"],
				"body-semibold": ["DMSans_600SemiBold"],
				"body-bold": ["DMSans_700Bold"],
			},
			borderRadius: {
				card: "16px",
				btn: "14px",
			},
		},
	},
	plugins: [],
};
