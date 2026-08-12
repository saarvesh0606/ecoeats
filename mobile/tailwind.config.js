/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: "class",
	content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
	presets: [require("nativewind/preset")],
	theme: {
		extend: {
			colors: {
				// Rebased onto the Flutter client's palette so the two read as one
				// product. Its tokens are placed at the steps that already carry
				// the same job here rather than being renamed: primaryGreen is the
				// deep brand green (this app's most-used shade), successEmerald is
				// the mid green, and inversePrimary is the light-on-dark tint.
				forest: {
					DEFAULT: "#0C3226", // Flutter primaryGreen
					50: "#f1f7f4",
					100: "#dcebe4",
					200: "#b9d7c9",
					300: "#A8CFBD", // Flutter inversePrimary
					400: "#5e9a80",
					500: "#3d7a61",
					600: "#2D6A4F", // Flutter successEmerald
					700: "#16452f",
					800: "#0C3226", // Flutter primaryGreen
					900: "#07211a",
				},
				lime: {
					DEFAULT: "#52B788",
					accent: "#74C69D",
				},
				// Warm neutrals from the Flutter design. It carries a fuller
				// surface ramp than this app had, which is what gives its cards
				// and chips their separation against the cream.
				surface: {
					DEFAULT: "#F0EEE9",
					low: "#F5F3EE",
					high: "#EAE8E3",
					highest: "#E4E2DD",
					dim: "#DBDAD5",
				},
				ink: {
					DEFAULT: "#1B1C19", // onSurface
					muted: "#414845", // onSurfaceVariant
				},
				outline: {
					DEFAULT: "#717974",
					variant: "#C1C8C3",
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
				cream: "#FBF9F4", // Flutter backgroundCream
			},
			// Editorial pairing: Playfair Display (serif) for headings, Inter for
			// body — the pairing the Flutter client uses. Weight variants are
			// explicit families because custom fonts do not synthesise weight on
			// native — use font-display-bold etc.
			fontFamily: {
				display: ["PlayfairDisplay_600SemiBold"],
				"display-medium": ["PlayfairDisplay_500Medium"],
				"display-bold": ["PlayfairDisplay_700Bold"],
				body: ["Inter_400Regular"],
				"body-medium": ["Inter_500Medium"],
				"body-semibold": ["Inter_600SemiBold"],
				"body-bold": ["Inter_700Bold"],
			},
			borderRadius: {
				card: "16px",
				btn: "14px",
			},
		},
	},
	plugins: [],
};
