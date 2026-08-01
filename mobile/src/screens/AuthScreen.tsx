import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
	Animated,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DEV_AUTH } from "@/config";
import { useAuth } from "@/context/AuthContext";
import {
	authErrorMessage,
	googleSignInSupported,
	registerWithEmail,
	signInWithEmail,
	signInWithGoogle,
} from "@/lib/firebase";
import { validateAsuEmail, validatePassword } from "@/lib/validation";

type Mode = "signin" | "register";

/** Where the form fades in from. Deliberately not 0 — see switchTo. */
const FADE_FROM = 0.25;

/**
 * One screen for both signing in and signing up, switched by a segmented
 * control.
 *
 * They were separate routes that linked to each other, which meant a full
 * screen transition to fix a wrong guess about whether you already had an
 * account. A toggle keeps the typed email in place across the switch.
 */
export function AuthScreen({ initialMode = "signin" }: { initialMode?: Mode }) {
	const { devSignIn } = useAuth();
	const [mode, setMode] = useState<Mode>(initialMode);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [googleLoading, setGoogleLoading] = useState(false);

	const registering = mode === "register";

	// Cross-fades the form when the tab changes, so the fields that appear or
	// disappear don't just pop.
	const formFade = useRef(new Animated.Value(1)).current;

	function switchTo(next: Mode) {
		if (next === mode) return;
		setMode(next);
		setError(null); // an error about the other form is just noise here

		formFade.setValue(FADE_FROM);
		Animated.timing(formFade, {
			toValue: 1,
			duration: 220,
			useNativeDriver: true,
		}).start();
		// The form must end up readable whether or not that animation ran, so
		// settle it on a timer too. It starts at FADE_FROM rather than 0 for the
		// same reason: a form nobody can see is worse than one that didn't fade.
		setTimeout(() => formFade.setValue(1), 400);
	}

	async function onSubmit() {
		const emailError = validateAsuEmail(email);
		if (emailError) return setError(emailError);
		if (registering) {
			const passwordError = validatePassword(password);
			if (passwordError) return setError(passwordError);
		}

		setError(null);
		setLoading(true);
		try {
			const address = email.trim().toLowerCase();
			if (registering) {
				await registerWithEmail(address, password, name.trim() || undefined);
			} else {
				await signInWithEmail(address, password);
			}
			// The auth gate takes over from here based on the new status.
		} catch (err) {
			setError(authErrorMessage(err));
		} finally {
			setLoading(false);
		}
	}

	async function onGoogle() {
		setError(null);
		setGoogleLoading(true);

		// signInWithPopup does not reliably reject when the user dismisses the
		// window: closing it mid-redirect (ASU's SSO lives on its own domain)
		// can leave the promise pending forever, and the button spins with no way
		// back. Focus returning to the app means the popup is gone, so treat that
		// as the cancel signal — after a beat, in case the popup closed *because*
		// sign-in succeeded and the SDK is still resolving.
		let settled = false;
		const canWatchFocus = Platform.OS === "web" && typeof window !== "undefined";
		const onWindowFocus = () => {
			setTimeout(() => {
				if (!settled) setGoogleLoading(false);
			}, 1200);
		};
		if (canWatchFocus) window.addEventListener("focus", onWindowFocus);

		try {
			await signInWithGoogle();
		} catch (err) {
			// A dismissed popup isn't an error worth shouting about.
			const code =
				typeof err === "object" && err !== null && "code" in err
					? String((err as { code: unknown }).code)
					: "";
			if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
				// signInWithGoogle throws a plain Error for the wrong-domain case,
				// which already reads well; Firebase codes go through the translator.
				setError(
					err instanceof Error && !("code" in err)
						? err.message
						: authErrorMessage(err),
				);
			}
		} finally {
			settled = true;
			if (canWatchFocus) window.removeEventListener("focus", onWindowFocus);
			setGoogleLoading(false);
		}
	}

	return (
		<KeyboardAvoidingView
			className="flex-1 bg-cream"
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<ScrollView
				contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<View className="px-6 py-10">
					{/* Brand */}
					<View className="items-center mb-6">
						<View className="w-14 h-14 rounded-2xl bg-forest-800 items-center justify-center">
							<Ionicons name="leaf" size={26} color="#86d6ad" />
						</View>
						<Text className="font-display-bold text-3xl text-forest-800 mt-3">
							EcoEats
						</Text>
						<Text className="font-body text-gray-500 text-sm mt-1">
							Rescue food. Feed people.
						</Text>
					</View>

					{/* Mode toggle */}
					<View className="flex-row bg-white border border-gray-200 rounded-btn p-1 mb-6">
						{(
							[
								["signin", "Sign In"],
								["register", "Create Account"],
							] as const
						).map(([value, label]) => {
							const on = mode === value;
							return (
								<Pressable
									key={value}
									onPress={() => switchTo(value)}
									className={`flex-1 rounded-btn py-2.5 ${on ? "bg-forest-800" : ""}`}
									accessibilityRole="button"
									accessibilityState={{ selected: on }}
								>
									<Text
										className={`font-body-semibold text-sm text-center ${on ? "text-white" : "text-gray-600"}`}
									>
										{label}
									</Text>
								</Pressable>
							);
						})}
					</View>

					{/* Style only, no className: NativeWind doesn't process classes on
					    animated components, and does so silently. */}
					<Animated.View
						style={{
							opacity: formFade,
							transform: [
								{
									translateY: formFade.interpolate({
										inputRange: [FADE_FROM, 1],
										outputRange: [8, 0],
									}),
								},
							],
						}}
					>
						{registering && (
							<Input
								label="Full name"
								placeholder="Your name"
								autoCapitalize="words"
								autoComplete="name"
								value={name}
								onChangeText={setName}
							/>
						)}

						<Input
							label="ASU email"
							placeholder="you@asu.edu"
							autoCapitalize="none"
							autoComplete="email"
							keyboardType="email-address"
							value={email}
							onChangeText={setEmail}
						/>
						<Input
							label="Password"
							placeholder={
								registering ? "At least 6 characters" : "Your password"
							}
							secureTextEntry
							autoComplete={registering ? "new-password" : "password"}
							value={password}
							onChangeText={setPassword}
						/>

						{error && (
							<Text className="text-red-500 font-body text-sm mb-3">
								{error}
							</Text>
						)}

						<Button onPress={onSubmit} loading={loading} size="lg">
							{registering ? "Create account" : "Sign in"}
						</Button>
					</Animated.View>

					{googleSignInSupported && (
						<>
							<View className="flex-row items-center my-5">
								<View className="flex-1 h-px bg-gray-200" />
								<Text className="font-body text-gray-400 text-xs mx-3">or</Text>
								<View className="flex-1 h-px bg-gray-200" />
							</View>
							<Button
								variant="outline"
								size="lg"
								loading={googleLoading}
								onPress={onGoogle}
								icon={<Ionicons name="logo-google" size={18} color="#4285F4" />}
							>
								Continue with Google
							</Button>
						</>
					)}

					<View className="items-center mt-6">
						<Text className="font-body-semibold text-[11px] text-maroon tracking-widest">
							ASU COMMUNITY ONLY
						</Text>
						<Text className="font-body text-gray-500 text-xs mt-1 text-center">
							EcoEats is for students, staff and community members with an
							asu.edu address.
						</Text>
					</View>

					{DEV_AUTH && (
						<View className="mt-8 pt-6 border-t border-gray-200">
							<Text className="font-body text-gray-400 text-xs text-center mb-3 uppercase tracking-wide">
								Dev — no real account needed
							</Text>
							<View className="flex-row gap-3">
								<View className="flex-1">
									<Button
										variant="outline"
										size="sm"
										onPress={() => devSignIn("organizer")}
									>
										Dev host
									</Button>
								</View>
								<View className="flex-1">
									<Button
										variant="outline"
										size="sm"
										onPress={() => devSignIn("recipient")}
									>
										Dev recipient
									</Button>
								</View>
							</View>
						</View>
					)}
				</View>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}
