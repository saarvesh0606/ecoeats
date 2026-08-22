import { Stack } from "expo-router";
import { UnreadProvider } from "@/context/UnreadContext";
import { usePushNavigation } from "@/hooks/usePushNavigation";

/**
 * The authenticated area: a stack whose base is the role-aware tab bar, with
 * full-screen detail routes pushed on top of it.
 *
 * Detail routes slide in from the right and can be swiped back, so pushing into
 * a listing and returning feels continuous rather than like a hard cut. The tab
 * bar itself gets no animation — switching tabs shouldn't look like navigation
 * deeper into the app.
 *
 * Tapped notifications are handled here rather than at the root, because the
 * listing they open lives in this stack and only makes sense signed in.
 *
 * The unread count is provided here for the same reason: the bell appears on
 * both home screens and the Activity list clears it, so it has to outlive any
 * one of them.
 */
export default function AppLayout() {
	usePushNavigation();

	return (
		<UnreadProvider>
			<Stack
				screenOptions={{
					headerShown: false,
					animation: "slide_from_right",
					gestureEnabled: true,
					contentStyle: { backgroundColor: "#FBF9F4" },
				}}
			>
				<Stack.Screen name="(tabs)" options={{ animation: "none" }} />
				<Stack.Screen name="listing/[id]" />
				<Stack.Screen name="manage/[id]" />
				<Stack.Screen
					name="notifications"
					options={{ animation: "slide_from_bottom" }}
				/>
				{/* Settings and its documents are separate routes so the phone's
				    back gesture returns to the list rather than leaving Settings
				    entirely — the gesture pops routes, and reading a document used
				    to be state inside one. */}
				<Stack.Screen name="settings/index" />
				<Stack.Screen name="settings/[doc]" />
			</Stack>
		</UnreadProvider>
	);
}
