import { Stack } from "expo-router";

/**
 * The authenticated area: a stack whose base is the role-aware tab bar, with
 * full-screen detail routes pushed on top of it.
 *
 * Detail routes slide in from the right and can be swiped back, so pushing into
 * a listing and returning feels continuous rather than like a hard cut. The tab
 * bar itself gets no animation — switching tabs shouldn't look like navigation
 * deeper into the app.
 */
export default function AppLayout() {
	return (
		<Stack
			screenOptions={{
				headerShown: false,
				animation: "slide_from_right",
				gestureEnabled: true,
				contentStyle: { backgroundColor: "#F8F6F0" },
			}}
		>
			<Stack.Screen name="(tabs)" options={{ animation: "none" }} />
			<Stack.Screen name="listing/[id]" />
			<Stack.Screen name="manage/[id]" />
			<Stack.Screen name="notifications" options={{ animation: "slide_from_bottom" }} />
		</Stack>
	);
}
