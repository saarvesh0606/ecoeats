import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Spinner } from "@/components/ui/Spinner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import "../global.css";

/**
 * Keeps the visible screen in step with auth status. Each status has a home
 * it belongs in; if the user is anywhere else, we send them back. This is the
 * one place routing decisions live, so no individual screen has to guard.
 */
function Gate() {
	const { status, profile } = useAuth();
	const segments = useSegments();
	const router = useRouter();

	useEffect(() => {
		if (status === "loading") return;

		const current = segments[segments.length - 1] ?? "";
		const inApp = segments[0] === "(app)";

		if (status === "signed-out" && !["login", "register"].includes(current)) {
			router.replace("/login");
		} else if (status === "unverified" && current !== "verify-email") {
			router.replace("/verify-email");
		} else if (status === "needs-profile" && current !== "role") {
			router.replace("/role");
		} else if (status === "ready" && !inApp) {
			// Land each role on its own home tab.
			router.replace(profile?.role === "organizer" ? "/posts" : "/feed");
		}
	}, [status, profile, segments, router]);

	if (status === "loading") {
		return (
			<View className="flex-1 bg-cream items-center justify-center">
				<Spinner />
			</View>
		);
	}

	return <Slot />;
}

export default function RootLayout() {
	return (
		<SafeAreaProvider>
			<AuthProvider>
				<StatusBar style="dark" />
				<Gate />
			</AuthProvider>
		</SafeAreaProvider>
	);
}
