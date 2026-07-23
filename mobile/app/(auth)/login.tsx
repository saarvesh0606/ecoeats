import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { authErrorMessage, signInWithEmail } from "@/lib/firebase";
import { validateAsuEmail } from "@/lib/validation";

export default function LoginScreen() {
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
				<Text className="font-display font-bold text-4xl text-forest-700 text-center">
					EcoEats
				</Text>
				<Text className="font-body text-gray-600 text-center mt-2 mb-10">
					Rescue campus food before it's gone.
				</Text>

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
			</View>
		</KeyboardAvoidingView>
	);
}
