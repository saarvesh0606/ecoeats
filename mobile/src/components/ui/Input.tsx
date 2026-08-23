import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
	Pressable,
	Text,
	type TextStyle,
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

/**
 * Single-line fields get an explicit height and no vertical padding.
 *
 * Inter is loaded as a custom font, and React Native lays custom-font text out
 * on the font's own ascent and descent. Padding a box that is already sized by
 * those metrics left the text sitting visibly below the middle of the field.
 * Giving the box a height and letting the platform centre one line inside it
 * puts the text where the eye expects, and 48 is a proper touch target besides.
 *
 * Multiline is excluded: a fixed height would crop it, and it wants its text
 * against the top anyway. Caller styles are merged last so they still win —
 * PostFood's description passes its own minHeight and textAlignVertical.
 */
const SINGLE_LINE: TextStyle = {
	height: 48,
	paddingVertical: 0,
	textAlignVertical: "center",
	// Android reserves extra room above and below from the font metrics, which
	// reintroduces exactly the offset this is removing.
	includeFontPadding: false,
	// Font size without a line height. Tailwind's text-base carries both, and on
	// iOS an explicit lineHeight on a TextInput positions the text inside a line
	// box rather than inside the field — so the first character sat centred and
	// everything after it dropped a few points, which is a strange enough thing
	// to watch that it reads as the field breaking. The class is dropped for
	// single-line fields below and the size restated here.
	fontSize: 16,
};

export function Input({
	label,
	error,
	className = "",
	secureTextEntry,
	multiline,
	style,
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
					className={`bg-white border rounded-btn px-4 ${multiline ? "py-3 text-base" : ""} font-body ${isPassword ? "pr-12" : ""} ${error ? "border-red-500" : "border-gray-300"} ${props.editable === false ? "bg-gray-100 text-gray-500" : "text-gray-900"}`}
					multiline={multiline}
					style={[multiline ? null : SINGLE_LINE, style]}
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
