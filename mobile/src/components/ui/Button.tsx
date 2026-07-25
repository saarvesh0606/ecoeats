import type { ReactNode } from "react";
import {
	ActivityIndicator,
	Pressable,
	Text,
	type ViewStyle,
} from "react-native";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
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
	accessibilityLabel,
	accessibilityHint,
	testID,
}: ButtonProps) {
	const variantStyles: Record<ButtonVariant, string> = {
		primary: "bg-forest-700 active:bg-forest-800",
		secondary: "bg-lime active:bg-lime-accent",
		outline: "bg-transparent border-2 border-forest-700 active:bg-forest-50",
		ghost: "bg-transparent active:bg-forest-50",
	};

	const textVariantStyles: Record<ButtonVariant, string> = {
		primary: "text-white",
		secondary: "text-forest-900",
		outline: "text-forest-700",
		ghost: "text-forest-700",
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
		<Pressable
			testID={testID}
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
				<Text
					className={`font-body-semibold ${textVariantStyles[variant]} ${textSizeStyles[size]}`}
				>
					{children}
				</Text>
			)}
		</Pressable>
	);
}
