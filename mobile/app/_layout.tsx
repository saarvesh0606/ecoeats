import {
	DMSans_400Regular,
	DMSans_500Medium,
	DMSans_600SemiBold,
	DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import {
	PlayfairDisplay_500Medium,
	PlayfairDisplay_600SemiBold,
	PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import { useFonts } from "expo-font";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PhoneFrame } from "@/components/ui/PhoneFrame";
import { Splash } from "@/components/ui/Splash";
import { ToastProvider } from "@/components/ui/Toast";
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
		return <Splash />;
	}

	return <Slot />;
}

/**
 * Floor on how long the splash stays up. Fonts and the auth check usually
 * resolve well inside this, so without it the brand moment is a flicker.
 */
const SPLASH_MIN_MS = 5000;

export default function RootLayout() {
	// Hold the app behind the splash until the editorial fonts are ready, so
	// headings never flash in a fallback face first.
	const [fontsLoaded] = useFonts({
		PlayfairDisplay_500Medium,
		PlayfairDisplay_600SemiBold,
		PlayfairDisplay_700Bold,
		DMSans_400Regular,
		DMSans_500Medium,
		DMSans_600SemiBold,
		DMSans_700Bold,
	});

	const [minimumElapsed, setMinimumElapsed] = useState(false);
	useEffect(() => {
		const timer = setTimeout(() => setMinimumElapsed(true), SPLASH_MIN_MS);
		return () => clearTimeout(timer);
	}, []);

	if (!fontsLoaded || !minimumElapsed) {
		return <Splash />;
	}

	return (
		<SafeAreaProvider>
			<PhoneFrame>
				<ToastProvider>
					<AuthProvider>
						<StatusBar style="dark" />
						<Gate />
					</AuthProvider>
				</ToastProvider>
			</PhoneFrame>
		</SafeAreaProvider>
	);
}
