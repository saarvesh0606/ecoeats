import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NotificationsList } from "@/components/NotificationsList";

/** Host "Activity" tab — the same notifications feed as the bell, but as a tab. */
export default function ActivityTab() {
	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<View className="px-5 pt-2 pb-3">
				<Text className="font-display-bold text-3xl text-forest-800">
					Activity
				</Text>
				<Text className="font-body text-gray-500 mt-0.5">
					Claims, pickups and ratings on your posts.
				</Text>
			</View>
			<NotificationsList />
		</SafeAreaView>
	);
}
