import { colorScheme, useColorScheme } from "nativewind";

/**
 * The colours that can't be written as a class.
 *
 * Icons, spinners and placeholderTextColor take a colour prop, not a
 * className, so the CSS variables that flip the rest of the app never reach
 * them. Left as hex they would stay put in dark mode — dark green icons
 * disappearing into a near-black page, which is the kind of half-flip that
 * reads as broken rather than unfinished.
 *
 * Only the roles that actually move live here. ASU maroon and gold, the reds,
 * and white-on-green stay literal at their call sites: they sit on backgrounds
 * that don't change, and importing them through here would suggest they might.
 *
 * These mirror the variables in global.css. The duplication is real but small,
 * and the alternative — reading a CSS variable back out at runtime — costs a
 * native round trip per icon for something that changes twice a day at most.
 */
export interface ThemeColors {
	brand: string;
	muted: string;
	secondary: string;
	hairline: string;
	page: string;
	card: string;
	halo: string;
}

const LIGHT: ThemeColors = {
	/** Green as ink: icons and glyphs beside headings and links. */
	brand: "#0C3226",
	/** Placeholders, chevrons, and icons that shouldn't compete. */
	muted: "#9CA3AF",
	/** Secondary text, and icons at the weight of secondary text. */
	secondary: "#6B7280",
	/** Hairlines drawn as a colour rather than a border class. */
	hairline: "#E5E7EB",
	/** The page itself, for anything that has to paint its own background. */
	page: "#FBF9F4",
	/** A raised surface: cards, and the tab bar that sits on top of them. */
	card: "#FFFFFF",
	/** The soft glow behind an empty-state icon. */
	halo: "#DCF5E7",
};

const DARK: ThemeColors = {
	// Lifted to the pale end of the ramp — the deep green is invisible here.
	brand: "#A8CFBD",
	muted: "#8C8F85",
	secondary: "#9EA197",
	hairline: "#383A32",
	page: "#121311",
	card: "#21231E",
	// Pale green on a dark page reads as a bright blob rather than a glow.
	halo: "#1E3A2C",
};

/**
 * The current palette, readable without being a hook.
 *
 * Deliberately not a hook, because these colours are needed inside twenty-odd
 * components and threading a hook call into each one is twenty-odd chances to
 * put it in the wrong function — in a change whose whole failure mode is one
 * screen not flipping with the others.
 *
 * Reading mutable state during render is only safe because something re-renders
 * the tree when the scheme changes: RootLayout subscribes with the hook below,
 * and nothing here is memoised, so a change reaches every screen. That is the
 * contract — if a screen is ever memoised, it needs the hook itself.
 */
export const theme: ThemeColors = new Proxy({} as ThemeColors, {
	get: (_target, key: string) =>
		(colorScheme.get() === "dark" ? DARK : LIGHT)[key as keyof ThemeColors],
});

/** Subscribe to scheme changes. RootLayout calls this so the tree re-renders. */
export function useThemeColors(): ThemeColors {
	const { colorScheme: scheme } = useColorScheme();
	return scheme === "dark" ? DARK : LIGHT;
}

/**
 * Apply an appearance choice, without letting it take the app down.
 *
 * NativeWind's colorScheme.set reaches for Appearance.setColorScheme, which
 * react-native-web does not implement — so on web this throws during render and
 * the whole app goes blank rather than merely staying light. Dark mode is worth
 * having; it is not worth a white screen on any platform that can't do it.
 *
 * The classes still respond to the OS setting on web through the media query,
 * so what is lost when this fails is the in-app override, not dark mode itself.
 */
export function applyColorScheme(choice: "light" | "dark" | "system"): void {
	try {
		colorScheme.set(choice);
	} catch {
		// Platform can't be told. It keeps whatever it was already showing.
	}
}
