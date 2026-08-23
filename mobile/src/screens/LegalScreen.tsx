import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { theme } from "@/hooks/useThemeColors";
import { LEGAL_DOCUMENTS, type LegalDocumentKey } from "@/lib/legal";

/**
 * One legal document, as its own screen.
 *
 * A route rather than state inside Settings, because the phone's back gesture
 * pops routes: rendering the document in place meant swiping back from the
 * terms threw the user all the way out to Profile, skipping the settings list
 * they came from. Nothing in the app could have caught that — it is the OS
 * gesture doing exactly what the navigation tree told it to.
 */
export function LegalScreen() {
	const router = useRouter();
	const { doc } = useLocalSearchParams<{ doc: string }>();

	const document = LEGAL_DOCUMENTS[doc as LegalDocumentKey];

	return (
		<SafeAreaView className="flex-1 bg-page" edges={["top"]}>
			<View className="px-5 pt-2 pb-1">
				<Pressable
					onPress={() => router.back()}
					accessibilityRole="button"
					accessibilityLabel="Back to settings"
					hitSlop={10}
					className="flex-row items-center py-2"
				>
					<Ionicons name="chevron-back" size={18} color={theme.brand} />
					<Text className="font-body-medium text-brand ml-1">Settings</Text>
				</Pressable>
			</View>

			{document ? (
				<LegalDocumentView document={document} />
			) : (
				// A link to a document that doesn't exist should say so plainly
				// rather than render an empty page that looks broken.
				<View className="px-5 pt-10">
					<Text className="font-body text-gray-500">
						That document isn't available.
					</Text>
				</View>
			)}
		</SafeAreaView>
	);
}
