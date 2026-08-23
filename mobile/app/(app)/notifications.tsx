import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NotificationsList } from "@/components/NotificationsList";
import { theme } from "@/hooks/useThemeColors";

export default function NotificationsScreen() {
	const router = useRouter();
	return (
		<SafeAreaView className="flex-1 bg-page" edges={["top"]}>
			<View className="px-5 pt-2 pb-3 flex-row items-center gap-2">
				<Pressable
					onPress={() => router.back()}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Back"
				>
					<Ionicons name="chevron-back" size={24} color={theme.brand} />
				</Pressable>
				<Text className="font-display-bold text-2xl text-brand">
					Notifications
				</Text>
			</View>
			<NotificationsList />
		</SafeAreaView>
	);
}
