import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
	Animated,
	Image,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DEV_AUTH } from "@/config";
import { useAuth } from "@/context/AuthContext";
import {
	authErrorMessage,
	googleSignInSupported,
	registerWithEmail,
	signInWithEmail,
} from "@/lib/firebase";
import { validateEmail, validatePassword } from "@/lib/validation";

type Mode = "signin" | "register";

/** Where the form fades in from. Deliberately not 0 — see switchTo. */
const FADE_FROM = 0.25;

/** Displayed size of the app mark. Square — the icon asset is 1024x1024. */
const LOGO_SIZE = 76;

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
	const router = useRouter();
	const [mode, setMode] = useState<Mode>(initialMode);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

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

	/**
	 * Hand the typed address to the reset screen so it does not have to be typed
	 * twice. Unvalidated on purpose — that screen validates, and bouncing someone
	 * with an error for a field they are trying to escape reads as the app
	 * refusing to help.
	 */
	function onForgotPassword() {
		const typed = email.trim();
		router.push(
			typed
				? { pathname: "/forgot-password", params: { email: typed } }
				: "/forgot-password",
		);
	}

	async function onSubmit() {
		const emailError = validateEmail(email);
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

	return (
		<KeyboardAvoidingView
			className="flex-1 bg-page"
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<ScrollView
				contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<View className="px-6 py-10">
					{/* Brand: the app's own mark, then the name, then what it is for.
					    The icon is the same one on the home screen, so the app someone
					    tapped and the screen that greets them are visibly the same
					    thing. Rounded to match how iOS renders it there — squared off,
					    it reads as a stray image rather than the app's identity. */}
					<View className="items-center mb-7">
						<Image
							source={require("../../assets/icon.png")}
							style={{
								width: LOGO_SIZE,
								height: LOGO_SIZE,
								borderRadius: LOGO_SIZE * 0.22,
							}}
							resizeMode="contain"
							accessibilityLabel="EcoEats"
							className="mb-5"
						/>
						<Text className="font-display-bold text-3xl text-brand text-center">
							EcoEats
						</Text>
						<Text className="font-body text-gray-500 text-sm mt-2 text-center">
							Share more. Waste less. Impact together.
						</Text>
					</View>

					{/* Mode toggle */}
					<View className="flex-row bg-card border border-gray-200 rounded-btn p-1 mb-6">
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
							label="Email"
							placeholder="you@gmail.com"
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

						{/* Sign-in only. On the register tab there is no password to have
						    forgotten, and offering the escape hatch there just invites
						    people to reset an account they have not made yet. */}
						{!registering && (
							<Pressable
								onPress={onForgotPassword}
								className="self-center mt-4"
								hitSlop={8}
								accessibilityRole="button"
							>
								<Text className="font-body-semibold text-sm text-brand">
									Forgot your password?
								</Text>
							</Pressable>
						)}
					</Animated.View>

					{googleSignInSupported && (
						<>
							<View className="flex-row items-center my-5">
								<View className="flex-1 h-px bg-gray-200" />
								<Text className="font-body text-gray-400 text-xs mx-3">or</Text>
								<View className="flex-1 h-px bg-gray-200" />
							</View>
							<GoogleSignInButton onError={setError} />
						</>
					)}

					{/* This was a university-community notice. That rule is gone —
					    pending permission to use the name — but the reassurance the
					    line carried is worth keeping, and the promise still enforced on
					    every request is the verified address (the backend's identity
					    gate). */}
					<View className="items-center mt-6">
						<Text className="font-body-semibold text-[11px] text-brand tracking-widest">
							VERIFIED ACCOUNTS ONLY
						</Text>
						<Text className="font-body text-gray-500 text-xs mt-1 text-center">
							Every account is confirmed by email before it can post or claim
							food.
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
