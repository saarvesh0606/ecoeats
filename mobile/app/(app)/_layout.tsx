import { Stack } from "expo-router";

// A plain stack for now. Becomes role-aware tab navigation (feed, map, post,
// claims, profile) once those screens land.
export default function AppLayout() {
	return <Stack screenOptions={{ headerShown: false }} />;
}
