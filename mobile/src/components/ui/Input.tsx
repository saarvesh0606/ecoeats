import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
	Pressable,
	Text,
	TextInput,
	type TextInputProps,
	View,
} from "react-native";

interface InputProps extends Omit<TextInputProps, "className"> {
	label?: string;
	error?: string;
	className?: string;
}

const PLACEHOLDER_COLOR = "#9CA3AF";

export function Input({
	label,
	error,
	className = "",
	secureTextEntry,
	...props
}: InputProps) {
	const inputId = label
		? `input-${label.toLowerCase().replace(/\s/g, "-")}`
		: undefined;

	// Password fields get an eye toggle. Typing a password blind on a phone
	// keyboard is the most common reason a correct one gets rejected.
	const [revealed, setRevealed] = useState(false);
	const isPassword = Boolean(secureTextEntry);

	return (
		<View className={`mb-4 ${className}`}>
			{label && (
				<Text
					nativeID={inputId}
					className="text-sm font-body font-medium text-gray-700 mb-1"
				>
					{label}
				</Text>
			)}
			<View className="relative justify-center">
				<TextInput
					className={`bg-white border rounded-btn px-4 py-3 font-body text-base ${isPassword ? "pr-12" : ""} ${error ? "border-red-500" : "border-gray-300"} ${props.editable === false ? "bg-gray-100 text-gray-500" : "text-gray-900"}`}
					placeholderTextColor={PLACEHOLDER_COLOR}
					accessibilityLabelledBy={inputId}
					secureTextEntry={isPassword && !revealed}
					{...props}
				/>
				{isPassword && (
					<Pressable
						onPress={() => setRevealed((v) => !v)}
						hitSlop={8}
						className="absolute right-4"
						accessibilityRole="button"
						accessibilityLabel={revealed ? "Hide password" : "Show password"}
					>
						<Ionicons
							name={revealed ? "eye-off-outline" : "eye-outline"}
							size={20}
							color={PLACEHOLDER_COLOR}
						/>
					</Pressable>
				)}
			</View>
			{error && (
				<Text
					accessibilityLiveRegion="assertive"
					className="text-sm text-red-500 mt-1 font-body"
				>
					{error}
				</Text>
			)}
		</View>
	);
}
