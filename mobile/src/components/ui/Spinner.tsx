import { ActivityIndicator, View } from "react-native";
import { theme } from "@/hooks/useThemeColors";

interface SpinnerProps {
	size?: "small" | "large";
	color?: string;
	className?: string;
}

export function Spinner({
	size = "large",
	color = theme.brand,
	className = "",
}: SpinnerProps) {
	return (
		<View className={`items-center justify-center ${className}`}>
			<ActivityIndicator size={size} color={color} />
		</View>
	);
}
