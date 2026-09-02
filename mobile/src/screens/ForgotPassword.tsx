import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	Text,
	View,
} from "react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { authErrorMessage, sendPasswordReset } from "@/lib/firebase";
import { validateEmail } from "@/lib/validation";

/**
 * Ask Firebase for a password-reset link.
 *
 * Two states in one screen rather than two routes: the form, and what happened.
 * Sending is the screen's whole purpose, so replacing the form with the outcome
 * keeps the address on screen right next to the advice about where to go
 * looking for the mail. A second route would have to carry the address along
 * just to say the same thing.
 */
export function ForgotPasswordScreen() {
	const router = useRouter();
	// Handed over by the sign-in form, so forgetting a password does not also
	// cost you retyping the address you just typed.
	const { email: handedOver } = useLocalSearchParams<{ email?: string }>();

	const [email, setEmail] = useState(handedOver ?? "");
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function onSend() {
		const address = email.trim().toLowerCase();
		const emailError = validateEmail(address);
		if (emailError) return setError(emailError);

		setError(null);
		setLoading(true);
		try {
			await sendPasswordReset(address);
			setSentTo(address);
		} catch (err) {
			setError(authErrorMessage(err));
		} finally {
			setLoading(false);
		}
	}

	/** Back to the form with the address kept — a typo is a correction, not a
	 *  restart. */
	function onUseAnother() {
		setSentTo(null);
		setError(null);
	}

	// replace, not back(): the gate can land a signed-out user on this route with
	// nothing underneath it to return to, and back() on an empty stack goes
	// nowhere at all.
	const toSignIn = () => router.replace("/login");

	if (sentTo) {
		return (
			<View className="flex-1 bg-page justify-center px-6">
				<Text className="font-display-bold text-3xl text-brand text-center">
					Check your email
				</Text>

				{/* "If an account exists" is not hedging, and must not be tightened to
            "We sent a link to X". Firebase distinguishes a known address from an
            unknown one; repeating that distinction here would let anyone with
            the app test addresses and learn which ones have accounts.
            The address is echoed back because that wording alone gives no
            feedback on a typo — seeing what was actually sent to does. */}
				<Text className="font-body text-gray-500 text-center mt-3 mb-2">
					If an account exists for
				</Text>
				<Text className="font-body-semibold text-gray-900 text-center mb-2">
					{sentTo}
				</Text>
				<Text className="font-body text-gray-500 text-center mb-3">
					you'll get a link to set a new password.
				</Text>

				{/* The same warning the verification screen carries, for the same
            reason: this mail leaves through the same sender, so until custom
            SMTP is configured it reliably lands in spam. */}
				<Text className="font-body text-gray-500 text-sm text-center mb-10">
					It can take a minute. Check your spam or junk folder — these often
					land there.
				</Text>

				{error && (
					<Text className="text-red-500 font-body text-sm text-center mb-4">
						{error}
					</Text>
				)}

				<Button onPress={toSignIn} size="lg">
					Back to sign in
				</Button>
				<View className="h-3" />
				<Button onPress={onSend} loading={loading} variant="outline">
					Send it again
				</Button>
				<View className="h-3" />
				<Button onPress={onUseAnother} variant="ghost">
					Use a different address
				</Button>
			</View>
		);
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
					<Text className="font-display-bold text-3xl text-brand text-center">
						Reset your password
					</Text>
					<Text className="font-body text-gray-500 text-center mt-3 mb-8">
						Enter your email and we'll send you a link to set a new one.
					</Text>

					<Input
						label="Email"
						placeholder="you@gmail.com"
						autoCapitalize="none"
						autoComplete="email"
						keyboardType="email-address"
						value={email}
						onChangeText={setEmail}
					/>

					{error && (
						<Text className="text-red-500 font-body text-sm mb-3">{error}</Text>
					)}

					<Button onPress={onSend} loading={loading} size="lg">
						Send reset link
					</Button>
					<View className="h-3" />
					<Button onPress={toSignIn} variant="ghost">
						Back to sign in
					</Button>
				</View>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}
