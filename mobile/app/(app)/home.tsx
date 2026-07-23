import { Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";

/**
 * Placeholder home. Proves the whole chain works end to end — sign in, verify,
 * role, profile from our API — and shows which side of the app the account is
 * on. The real feed / posting panel replace this next.
 */
export default function HomeScreen() {
	const { profile, signOut } = useAuth();

	const greeting =
		profile?.role === "organizer"
			? "You're set up to share food."
			: "You're set up to find food.";

	return (
		<View className="flex-1 bg-cream justify-center px-6">
			<Text className="font-body text-forest-600 text-center uppercase tracking-wide text-xs">
				{profile?.role}
			</Text>
			<Text className="font-display font-bold text-3xl text-gray-900 text-center mt-2">
				Hi {profile?.name}
			</Text>
			<Text className="font-body text-gray-600 text-center mt-2">{greeting}</Text>
			<Text className="font-body text-gray-400 text-center mt-8 text-sm">
				{profile?.email}
			</Text>

			<View className="mt-10">
				<Button onPress={signOut} variant="outline">
					Sign out
				</Button>
			</View>
		</View>
	);
}
