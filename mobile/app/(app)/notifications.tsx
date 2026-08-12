import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NotificationsList } from "@/components/NotificationsList";

export default function NotificationsScreen() {
	const router = useRouter();
	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<View className="px-5 pt-2 pb-3 flex-row items-center gap-2">
				<Pressable
					onPress={() => router.back()}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Back"
				>
					<Ionicons name="chevron-back" size={24} color="#0C3226" />
				</Pressable>
				<Text className="font-display-bold text-2xl text-forest-800">
					Notifications
				</Text>
			</View>
			<NotificationsList />
		</SafeAreaView>
	);
}
