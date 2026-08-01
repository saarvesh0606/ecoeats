import type { ReactNode } from "react";
import { ActivityIndicator, Text, type ViewStyle } from "react-native";
import { PressableScale } from "@/components/ui/PressableScale";

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
	/** Rendered before the label — e.g. a provider mark on a sign-in button. */
	icon?: ReactNode;
	accessibilityLabel?: string;
	accessibilityHint?: string;
	testID?: string;
}

const COLORS = {
	forest: "#1B4332",
	white: "#FFFFFF",
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
	accessibilityLabel,
	accessibilityHint,
	testID,
}: ButtonProps) {
	const variantStyles: Record<ButtonVariant, string> = {
		primary: "bg-forest-700 active:bg-forest-800",
		secondary: "bg-lime active:bg-lime-accent",
		outline: "bg-transparent border-2 border-forest-700 active:bg-forest-50",
		ghost: "bg-transparent active:bg-forest-50",
		// Destructive, and styled to look it — ending a post can't be undone.
		danger: "bg-transparent border-2 border-red-300 active:bg-red-50",
	};

	const textVariantStyles: Record<ButtonVariant, string> = {
		primary: "text-white",
		secondary: "text-forest-900",
		outline: "text-forest-700",
		ghost: "text-forest-700",
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
