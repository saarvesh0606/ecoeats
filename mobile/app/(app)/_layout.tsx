import { Stack } from "expo-router";

/**
 * The authenticated area: a stack whose base is the role-aware tab bar, with
 * full-screen detail routes pushed on top of it.
 */
export default function AppLayout() {
	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="(tabs)" />
			<Stack.Screen name="listing/[id]" />
			<Stack.Screen name="manage/[id]" />
		</Stack>
	);
}
