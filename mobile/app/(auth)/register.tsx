import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { authErrorMessage, registerWithEmail } from "@/lib/firebase";
import { validateAsuEmail, validatePassword } from "@/lib/validation";

export default function RegisterScreen() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function onSubmit() {
		const emailError = validateAsuEmail(email);
		const passwordError = validatePassword(password);
		if (emailError || passwordError) {
			setError(emailError ?? passwordError);
			return;
		}
		setError(null);
		setLoading(true);
		try {
			await registerWithEmail(email.trim().toLowerCase(), password);
			// Firebase signs the new user in immediately; the gate then routes
			// to email verification, since the address isn't confirmed yet.
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
				<Text className="font-display-bold text-3xl text-forest-800 text-center">
					Create your account
				</Text>
				<Text className="font-body text-gray-500 text-center mt-2 mb-10">
					An ASU email is required. We'll send a link to confirm it.
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
					placeholder="At least 6 characters"
					secureTextEntry
					autoComplete="new-password"
					value={password}
					onChangeText={setPassword}
				/>

				{error && (
					<Text className="text-red-500 font-body text-sm mb-3">{error}</Text>
				)}

				<Button onPress={onSubmit} loading={loading} size="lg">
					Create account
				</Button>

				<View className="flex-row justify-center mt-6">
					<Text className="font-body text-gray-500">Already have one? </Text>
					<Link href="/login" className="font-body-semibold text-forest-700">
						Sign in
					</Link>
				</View>
			</View>
		</KeyboardAvoidingView>
	);
}
