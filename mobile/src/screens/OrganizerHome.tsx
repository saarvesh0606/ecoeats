import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";

/**
 * Organizer landing. A placeholder until the posting panel and "my listings"
 * are built — the recipient feed came first because it's the read path the
 * whole product hangs off.
 */
export function OrganizerHome() {
	const { profile, signOut } = useAuth();

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<View className="flex-1 justify-center px-6">
				<Text className="font-body text-forest-600 text-xs uppercase tracking-wide text-center">
					Organizer
				</Text>
				<Text className="font-display font-bold text-3xl text-gray-900 text-center mt-2">
					Hi {profile?.name?.split(" ")[0]}
				</Text>
				<Text className="font-body text-gray-600 text-center mt-2">
					Your posting panel is coming next — you'll snap a photo, describe the
					food, and set how long it's up.
				</Text>
				<View className="mt-10">
					<Button onPress={signOut} variant="outline">
						Sign out
					</Button>
				</View>
			</View>
		</SafeAreaView>
	);
}
