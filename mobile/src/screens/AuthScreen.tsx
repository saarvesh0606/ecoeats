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
import { validateAsuEmail, validatePassword } from "@/lib/validation";

type Mode = "signin" | "register";

/** Where the form fades in from. Deliberately not 0 — see switchTo. */
const FADE_FROM = 0.25;

/** Displayed width of the ASU lockup; its 540x414 ratio sets the height. */
const ASU_LOGO_WIDTH = 104;

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
					{/* Brand: the ASU lockup carries the identity on its own. It already
					    reads "Arizona State University", so there is no separate wordmark
					    line, and the height comes from the asset's own 540x414 ratio so
					    the mark can't stretch. */}
					<View className="items-center mb-7">
						<Image
							source={require("../../assets/asu-logo.png")}
							style={{ width: ASU_LOGO_WIDTH, height: ASU_LOGO_WIDTH / 1.304 }}
							resizeMode="contain"
							accessibilityLabel="Arizona State University"
							className="mb-5"
						/>
						<Text className="font-display-bold text-3xl text-brand text-center">
							Welcome to EcoEats
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
