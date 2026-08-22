import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useUnread } from "@/context/UnreadContext";

/**
 * The bell, with a dot when something is waiting.
 *
 * One component rather than the same markup on both home screens: a dot that
 * appeared on one and not the other would look like a bug on whichever screen
 * you happened to be standing on.
 *
 * A dot, not a number. The count is on the Activity screen itself; out here the
 * only question is whether it's worth a look.
 */
export function NotificationBell() {
	const router = useRouter();
	const { unread } = useUnread();

	return (
		<Pressable
			hitSlop={8}
			className="mt-1"
			onPress={() => router.push("/notifications")}
			accessibilityRole="button"
			accessibilityLabel={
				unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
			}
		>
			<View>
				<Ionicons name="notifications-outline" size={24} color="#0C3226" />
				{unread > 0 && (
					// Cream ring so the dot reads as separate from the bell rather
					// than as part of the glyph, on either home screen's background.
					<View
						accessibilityLabel="Unread notifications"
						className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-600 border border-cream"
					/>
				)}
			</View>
		</Pressable>
	);
}
