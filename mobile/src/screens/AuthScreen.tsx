import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
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

	function switchTo(next: Mode) {
		setMode(next);
		setError(null); // an error about the other form is just noise here
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
		try {
			await signInWithGoogle();
		} catch (err) {
			// signInWithGoogle throws a plain Error for the wrong-domain case, which
			// already reads well; Firebase codes go through the translator.
			setError(
				err instanceof Error && !("code" in err)
					? err.message
					: authErrorMessage(err),
			);
		} finally {
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
						placeholder={registering ? "At least 6 characters" : "Your password"}
						secureTextEntry
						autoComplete={registering ? "new-password" : "password"}
						value={password}
						onChangeText={setPassword}
					/>

					{error && (
						<Text className="text-red-500 font-body text-sm mb-3">{error}</Text>
					)}

					<Button onPress={onSubmit} loading={loading} size="lg">
						{registering ? "Create account" : "Sign in"}
					</Button>

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
