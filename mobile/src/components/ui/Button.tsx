import type { ReactNode } from "react";
import { ActivityIndicator, Text, type ViewStyle } from "react-native";
import { PressableScale } from "@/components/ui/PressableScale";
import { theme } from "@/hooks/useThemeColors";
import type { Feel } from "@/lib/haptics";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
	children: ReactNode;
	variant?: ButtonVariant;
	size?: ButtonSize;
	disabled?: boolean;
	loading?: boolean;
	onPress: () => void;
	style?: ViewStyle;
	className?: string;
	/** Overrides the variant's feedback. `"none"` for a button that should be
	 *  silent despite looking like a committing one. */
	haptic?: Feel | "none";
	/** Rendered before the label — e.g. a provider mark on a sign-in button. */
	icon?: ReactNode;
	accessibilityLabel?: string;
	accessibilityHint?: string;
	testID?: string;
}

const COLORS = {
	forest: theme.brand,
	white: "#FFFFFF",
};

/**
 * The variant already says how much a button commits to, so it can pick the
 * feedback too and call sites stay clean.
 *
 * The filled variants are the affirmative ones — claim, publish, save — and get
 * a crisp tick. `danger` gets a heavier one, because ending a post can't be
 * undone and it should feel like it weighs something. The flat variants carry
 * the retreats and detours ("Cancel", "Try again", "Browse food"); a phone that
 * pulses just as insistently when you back out as when you commit is a phone
 * that has stopped saying anything.
 */
const VARIANT_FEEL: Record<ButtonVariant, Feel | "none"> = {
	primary: "tap",
	secondary: "tap",
	danger: "press",
	outline: "none",
	ghost: "none",
};

export function Button({
	children,
	variant = "primary",
	size = "md",
	disabled = false,
	loading = false,
	onPress,
	style,
	className,
	icon,
	haptic,
	accessibilityLabel,
	accessibilityHint,
	testID,
}: ButtonProps) {
	const feel = haptic ?? VARIANT_FEEL[variant];
	/**
	 * ⚠️ NO `active:` VARIANTS HERE. They made every button on iOS untappable.
	 *
	 * These classes land on the plain View inside PressableScale, and
	 * NativeWind's native runtime converts any View carrying a pseudo-class
	 * into a Pressable so it can track press state (css-interop's
	 * render-component: `component = Pressable`). That produced a Pressable
	 * nested inside PressableScale's own Pressable; the inner one took the
	 * responder and forwarded to its own `onPress`, which is undefined because
	 * the View is only ever given a className. Every press was swallowed.
	 *
	 * Invisible on web, where the same variants compile to real CSS and no
	 * upgrade happens — so the whole suite and every browser pass stayed green
	 * while no button worked on a phone.
	 *
	 * The press feedback is PressableScale's spring dip, which is what that
	 * component exists for; its own docstring argues a scale reads as physical
	 * where a colour swap does not. So nothing was lost closing this.
	 */
	const variantStyles: Record<ButtonVariant, string> = {
		primary: "bg-forest-700",
		secondary: "bg-lime",
		outline: "bg-transparent border-2 border-forest-700",
		ghost: "bg-transparent",
		// Destructive, and styled to look it — ending a post can't be undone.
		danger: "bg-transparent border-2 border-red-300",
	};

	const textVariantStyles: Record<ButtonVariant, string> = {
		primary: "text-white",
		secondary: "text-forest-900",
		outline: "text-brand",
		ghost: "text-brand",
		danger: "text-red-600",
	};

	const sizeStyles: Record<ButtonSize, string> = {
		sm: "px-3 py-2",
		md: "px-4 py-3",
		lg: "px-6 py-4",
	};

	const textSizeStyles: Record<ButtonSize, string> = {
		sm: "text-sm",
		md: "text-base",
		lg: "text-lg",
	};

	return (
		<PressableScale
			testID={testID}
			// Buttons are small, so they need a shallower dip than a full card.
			scaleTo={0.96}
			haptic={feel === "none" ? undefined : feel}
			className={`rounded-btn items-center justify-center flex-row ${variantStyles[variant]} ${sizeStyles[size]} ${disabled || loading ? "opacity-50" : ""} ${className || ""}`}
			onPress={onPress}
			disabled={disabled || loading}
			style={style}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityHint={accessibilityHint ?? (loading ? "Loading" : undefined)}
			accessibilityState={{ disabled: disabled || loading, busy: loading }}
		>
			{loading ? (
				<ActivityIndicator
					size="small"
					color={variant === "primary" ? COLORS.white : COLORS.forest}
				/>
			) : (
				<>
					{icon}
					<Text
						className={`font-body-semibold ${icon ? "ml-2" : ""} ${textVariantStyles[variant]} ${textSizeStyles[size]}`}
					>
						{children}
					</Text>
				</>
			)}
		</PressableScale>
	);
}
