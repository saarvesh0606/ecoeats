/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: "class",
	content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
	presets: [require("nativewind/preset")],
	theme: {
		extend: {
			colors: {
				// Roles that flip between light and dark. Defined in global.css so
				// one swap moves every screen; see the note there about why the
				// names stay literal. <alpha-value> keeps bg-white/90 and friends
				// working, which a plain var() would break.
				// Surfaces. These flip.
				page: "rgb(var(--c-page) / <alpha-value>)",
				card: "rgb(var(--c-card) / <alpha-value>)",
				// The literal colours, which do not flip, because they are used as
				// ink on backgrounds that stay the colour they are — a white label
				// on a green button is white in both themes.
				cream: "#FBF9F4",
				white: "#FFFFFF",
				gray: {
					50: "rgb(var(--c-gray-50) / <alpha-value>)",
					100: "rgb(var(--c-gray-100) / <alpha-value>)",
					200: "rgb(var(--c-gray-200) / <alpha-value>)",
					300: "rgb(var(--c-gray-300) / <alpha-value>)",
					400: "rgb(var(--c-gray-400) / <alpha-value>)",
					500: "rgb(var(--c-gray-500) / <alpha-value>)",
					600: "rgb(var(--c-gray-600) / <alpha-value>)",
					700: "rgb(var(--c-gray-700) / <alpha-value>)",
					900: "rgb(var(--c-gray-900) / <alpha-value>)",
				},
				// Green as ink. Separate from the greens below, which are surfaces:
				// in dark a heading must lighten while a button must not.
				brand: "rgb(var(--c-brand) / <alpha-value>)",
				// Rebased onto the Flutter client's palette so the two read as one
				// product. Its tokens are placed at the steps that already carry
				// the same job here rather than being renamed: primaryGreen is the
				// deep brand green (this app's most-used shade), successEmerald is
				// the mid green, and inversePrimary is the light-on-dark tint.
				forest: {
					DEFAULT: "#0C3226", // Flutter primaryGreen
					50: "rgb(var(--c-forest-50) / <alpha-value>)",
					100: "#dcebe4",
					200: "#b9d7c9",
					300: "#A8CFBD", // Flutter inversePrimary
					400: "#5e9a80",
					500: "#3d7a61",
					600: "rgb(var(--c-forest-600) / <alpha-value>)",
					700: "rgb(var(--c-forest-700) / <alpha-value>)",
					800: "rgb(var(--c-forest-800) / <alpha-value>)",
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
					high: "rgb(var(--c-surface-high) / <alpha-value>)",
					highest: "#E4E2DD",
					dim: "#DBDAD5",
				},
				ink: {
					DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
					muted: "rgb(var(--c-ink-muted) / <alpha-value>)",
				},
				outline: {
					DEFAULT: "rgb(var(--c-outline) / <alpha-value>)",
					variant: "#C1C8C3",
				},
				amber: {
					50: "rgb(var(--c-amber-tint) / <alpha-value>)",
					200: "rgb(var(--c-amber-edge) / <alpha-value>)",
					700: "rgb(var(--c-amber-ink) / <alpha-value>)",
					800: "rgb(var(--c-amber-ink-strong) / <alpha-value>)",
				},
				red: {
					50: "rgb(var(--c-red-tint) / <alpha-value>)",
					100: "rgb(var(--c-red-tint-strong) / <alpha-value>)",
					300: "rgb(var(--c-red-edge) / <alpha-value>)",
					500: "#EF4444",
					600: "rgb(var(--c-red-ink) / <alpha-value>)",
					700: "rgb(var(--c-red-ink-strong) / <alpha-value>)",
				},
				// ASU brand. Maroon is the primary mark colour; gold is the ASU
				// accent, with a muted bronze for the editorial subtitle rule.
				maroon: {
					DEFAULT: "rgb(var(--c-maroon-ink) / <alpha-value>)",
					50: "rgb(var(--c-maroon-tint) / <alpha-value>)",
					600: "#7a1938",
					700: "#6b1230",
				},
				gold: {
					DEFAULT: "#FFC627",
					muted: "#B08D3F",
				},
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
