import { Image, Text, View } from "react-native";

/** "Demo Host" -> "DH", "taylor" -> "T". Falls back to a dot for empty names. */
function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "·";
	if (parts.length === 1) return parts[0][0].toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZES = {
	sm: { box: "w-9 h-9", text: "text-xs" },
	md: { box: "w-12 h-12", text: "text-base" },
	lg: { box: "w-16 h-16", text: "text-xl" },
} as const;

/**
 * A person, shown as their photo when there is one and their initials when
 * there isn't. Initials beat a generic silhouette: in a list of claims the
 * host is trying to tell people apart, and every silhouette looks the same.
 */
export function Avatar({
	name,
	uri,
	size = "sm",
}: {
	name: string;
	uri?: string | null;
	size?: keyof typeof SIZES;
}) {
	const { box, text } = SIZES[size];

	if (uri) {
		return (
			<Image
				source={{ uri }}
				className={`${box} rounded-full bg-forest-100`}
				accessibilityLabel={name}
			/>
		);
	}

	return (
		<View
			className={`${box} rounded-full bg-forest-100 items-center justify-center`}
		>
			<Text className={`font-body-semibold text-brand ${text}`}>
				{initialsOf(name)}
			</Text>
		</View>
	);
}
