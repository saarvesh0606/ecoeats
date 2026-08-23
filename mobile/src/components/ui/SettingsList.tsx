import { Ionicons } from "@expo/vector-icons";
import { Children, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { theme } from "@/hooks/useThemeColors";

/**
 * The grouped-list idiom used by Settings and the bottom of Profile.
 *
 * Shared rather than copied because these two screens sit one tap apart: a row
 * that looked slightly different on each would read as two different apps. It
 * also replaces what Profile had — three identical outline buttons stacked with
 * horizontal rules between them, which gave equal weight to "switch the whole
 * account over" and "sign out", and competed with the one real button on the
 * page.
 */
export function SettingsGroup({
	title,
	children,
}: {
	title?: string;
	children: ReactNode;
}) {
	return (
		<View className="mb-6">
			{title && (
				<Text className="font-body-semibold text-xs text-gray-400 uppercase tracking-wide mb-2 px-1">
					{title}
				</Text>
			)}
			<View className="rounded-card bg-card border border-gray-100 overflow-hidden">
				{/* Dividers are the group's job, not each row's — a caller placing
				    them by hand always ends up with a stray one at the bottom. */}
				{Children.map(Children.toArray(children), (child, i) => (
					<>
						{i > 0 && <View className="h-px bg-gray-100 ml-[52px]" />}
						{child}
					</>
				))}
			</View>
		</View>
	);
}

export function SettingsRow({
	icon,
	label,
	subtitle,
	detail,
	onPress,
	danger = false,
	loading = false,
	accessory,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	/** A line under the label, for a row whose consequence isn't obvious. */
	subtitle?: string;
	/** Right-aligned value, for rows that report rather than navigate. */
	detail?: string;
	onPress?: () => void;
	danger?: boolean;
	loading?: boolean;
	/** Replaces the chevron — a Switch, for instance. */
	accessory?: ReactNode;
}) {
	const tint = danger ? "#DC2626" : theme.brand;

	const content = (
		<View className="flex-row items-center px-4 py-3.5">
			<View
				className={`w-7 h-7 rounded-full items-center justify-center ${
					danger ? "bg-red-50" : "bg-forest-50"
				}`}
			>
				<Ionicons name={icon} size={16} color={tint} />
			</View>

			<View className="flex-1 ml-3">
				<Text className={`font-body ${danger ? "text-red-600" : "text-ink"}`}>
					{label}
				</Text>
				{subtitle && (
					<Text className="font-body text-gray-400 text-xs mt-0.5 leading-4">
						{subtitle}
					</Text>
				)}
			</View>

			{detail && (
				<Text className="font-body text-gray-400 text-sm mr-1">{detail}</Text>
			)}
			{loading ? (
				<ActivityIndicator size="small" color={tint} />
			) : (
				(accessory ??
				(onPress ? (
					<Ionicons name="chevron-forward" size={16} color={theme.muted} />
				) : null))
			)}
		</View>
	);

	if (!onPress) return content;

	return (
		<Pressable
			onPress={onPress}
			disabled={loading}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: loading, busy: loading }}
		>
			{content}
		</Pressable>
	);
}
