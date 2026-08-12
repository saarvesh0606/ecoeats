import {
	Inter_400Regular,
	Inter_500Medium,
	Inter_600SemiBold,
	Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
	PlayfairDisplay_500Medium,
	PlayfairDisplay_600SemiBold,
	PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import { useFonts } from "expo-font";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
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
 * resolve well inside this, so without it the brand moment is a flicker — but
 * much beyond this it stops being a greeting and starts being a wait.
 */
const SPLASH_MIN_MS = 2800;
/** Cross-fade out of the splash. */
const SPLASH_FADE_MS = 450;

/**
 * Covers the app with the splash, then fades it away.
 *
 * The app mounts underneath while this is still opaque, so the first frame
 * behind the fade is the real screen rather than a blank one.
 */
function SplashOverlay({ done }: { done: boolean }) {
	const opacity = useRef(new Animated.Value(1)).current;
	const [removed, setRemoved] = useState(false);

	useEffect(() => {
		if (!done) return;
		Animated.timing(opacity, {
			toValue: 0,
			duration: SPLASH_FADE_MS,
			useNativeDriver: true,
		}).start(() => setRemoved(true));

		// Never let a splash that won't fade trap the app behind it: unmount on a
		// timer regardless of whether the animation actually ran.
		const failsafe = setTimeout(() => setRemoved(true), SPLASH_FADE_MS + 250);
		return () => clearTimeout(failsafe);
	}, [done, opacity]);

	if (removed) return null;

	return (
		<Animated.View
			pointerEvents={done ? "none" : "auto"}
			style={[StyleSheet.absoluteFillObject, { opacity, zIndex: 10 }]}
		>
			<Splash />
		</Animated.View>
	);
}

export default function RootLayout() {
	// Hold the app behind the splash until the editorial fonts are ready, so
	// headings never flash in a fallback face first.
	const [fontsLoaded] = useFonts({
		PlayfairDisplay_500Medium,
		PlayfairDisplay_600SemiBold,
		PlayfairDisplay_700Bold,
		Inter_400Regular,
		Inter_500Medium,
		Inter_600SemiBold,
		Inter_700Bold,
	});

	const [minimumElapsed, setMinimumElapsed] = useState(false);
	useEffect(() => {
		const timer = setTimeout(() => setMinimumElapsed(true), SPLASH_MIN_MS);
		return () => clearTimeout(timer);
	}, []);

	// Until the fonts land there is nothing worth showing behind the splash —
	// mounting early would render headings in a fallback face.
	if (!fontsLoaded) {
		return <Splash />;
	}

	return (
		<SafeAreaProvider>
			<PhoneFrame>
				<ToastProvider>
					<ConfirmProvider>
						<AuthProvider>
							<StatusBar style="dark" />
							<Gate />
						</AuthProvider>
					</ConfirmProvider>
				</ToastProvider>
			</PhoneFrame>
			<SplashOverlay done={minimumElapsed} />
		</SafeAreaProvider>
	);
}
