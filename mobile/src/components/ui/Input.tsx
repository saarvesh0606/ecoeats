import { Text, TextInput, type TextInputProps, View } from "react-native";

interface InputProps extends Omit<TextInputProps, "className"> {
	label?: string;
	error?: string;
	className?: string;
}

const PLACEHOLDER_COLOR = "#9CA3AF";

export function Input({ label, error, className = "", ...props }: InputProps) {
	const inputId = label
		? `input-${label.toLowerCase().replace(/\s/g, "-")}`
		: undefined;

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
			<TextInput
				className={`bg-white border rounded-btn px-4 py-3 font-body text-base ${error ? "border-red-500" : "border-gray-300"} ${props.editable === false ? "bg-gray-100 text-gray-500" : "text-gray-900"}`}
				placeholderTextColor={PLACEHOLDER_COLOR}
				accessibilityLabelledBy={inputId}
				{...props}
			/>
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
