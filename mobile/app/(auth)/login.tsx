import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DEV_AUTH } from "@/config";
import { useAuth } from "@/context/AuthContext";
import { authErrorMessage, signInWithEmail } from "@/lib/firebase";
import { validateAsuEmail } from "@/lib/validation";

export default function LoginScreen() {
	const { devSignIn } = useAuth();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function onSubmit() {
		const emailError = validateAsuEmail(email);
		if (emailError) {
			setError(emailError);
			return;
		}
		setError(null);
		setLoading(true);
		try {
			await signInWithEmail(email.trim().toLowerCase(), password);
			// The auth gate takes over from here based on the new status.
		} catch (err) {
			setError(authErrorMessage(err));
		} finally {
			setLoading(false);
		}
	}

	return (
		<KeyboardAvoidingView
			className="flex-1 bg-cream"
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<View className="flex-1 justify-center px-6">
				{/* ASU mark. TODO: swap for <Image source={require("../../assets/asu-logo.png")} />
				    once the official logo file is dropped into mobile/assets. */}
				<View className="items-center mb-6">
					<Text className="font-display-bold text-2xl text-maroon">ASU</Text>
					<Text className="font-body-medium text-[10px] text-maroon tracking-widest mt-0.5">
						ARIZONA STATE UNIVERSITY
					</Text>
				</View>

				<Text className="font-display-bold text-4xl text-forest-800 text-center">
					Welcome to EcoEats
				</Text>
				<Text className="font-body text-gray-500 text-center mt-2 mb-8">
					Share more. Waste less. Impact together.
				</Text>

				<View className="items-center mb-6">
					<Text className="font-body-semibold text-[11px] text-maroon tracking-widest">
						ASU COMMUNITY ONLY
					</Text>
					<Text className="font-body text-gray-500 text-xs mt-1">
						Use your asu.edu email to continue.
					</Text>
				</View>

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
					placeholder="Your password"
					secureTextEntry
					autoComplete="password"
					value={password}
					onChangeText={setPassword}
				/>

				{error && (
					<Text className="text-red-500 font-body text-sm mb-3">{error}</Text>
				)}

				<Button onPress={onSubmit} loading={loading} size="lg">
					Sign in
				</Button>

				<View className="flex-row justify-center mt-6">
					<Text className="font-body text-gray-600">New here? </Text>
					<Link href="/register" className="font-body font-semibold text-forest-700">
						Create an account
					</Link>
				</View>

				{DEV_AUTH && (
					<View className="mt-10 pt-6 border-t border-gray-200">
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
									Dev organizer
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
		</KeyboardAvoidingView>
	);
}
