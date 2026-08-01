import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

/**
 * The first thing the app shows, and the screen it falls back to whenever it
 * can't yet say who you are.
 *
 * It covers two waits that would otherwise flash different colours at you: the
 * editorial fonts loading, and the auth check resolving. Holding one branded
 * screen across both makes startup read as a single moment rather than a
 * stutter.
 */
export function Splash() {
	return (
		<View className="flex-1 bg-forest-800 items-center justify-center">
			<View className="w-16 h-16 rounded-2xl bg-forest-600/40 items-center justify-center">
				<Ionicons name="leaf" size={30} color="#86d6ad" />
			</View>
			<Text className="font-display-bold text-2xl text-white mt-4">EcoEats</Text>
			<Text className="font-body text-forest-100/70 text-sm mt-1">
				Rescue food. Feed people.
			</Text>
		</View>
	);
}
