import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { authErrorMessage, resendVerification } from "@/lib/firebase";

export default function VerifyEmailScreen() {
	const { firebaseUser, refresh, signOut } = useAuth();
	const [message, setMessage] = useState<string | null>(null);
	const [checking, setChecking] = useState(false);
	const [resending, setResending] = useState(false);

	async function onCheck() {
		setChecking(true);
		setMessage(null);
		try {
			await refresh();
			// If still unverified, the gate keeps us here — say so.
			setMessage("Not verified yet. Click the link in your email, then retry.");
		} finally {
			setChecking(false);
		}
	}

	async function onResend() {
		setResending(true);
		setMessage(null);
		try {
			await resendVerification();
			setMessage("Sent. Check your inbox — and your spam folder.");
		} catch (err) {
			setMessage(authErrorMessage(err));
		} finally {
			setResending(false);
		}
	}

	return (
		<View className="flex-1 bg-cream justify-center px-6">
			<Text className="font-display-bold text-3xl text-brand text-center">
				Confirm your email
			</Text>
			<Text className="font-body text-gray-500 text-center mt-3 mb-2">
				We sent a verification link to
			</Text>
			<Text className="font-body-semibold text-gray-900 text-center mb-3">
				{firebaseUser?.email}
			</Text>

			{/* Said up front, not only after a resend. Firebase sends these from
			    noreply@<project>.firebaseapp.com — a domain shared across every
			    Firebase project and heavily abused for phishing, so it carries
			    poor sender reputation. Gmail was confirmed to file it as spam;
			    university gateways quarantine it. Until custom SMTP is
			    configured, "check your spam folder" is not boilerplate here, it
			    is the single most useful thing this screen can say. */}
			<Text className="font-body text-gray-500 text-sm text-center mb-10">
				It can take a minute. Check your spam or junk folder — these often land
				there.
			</Text>

			{message && (
				<Text className="font-body text-sm text-brand text-center mb-4">
					{message}
				</Text>
			)}

			<Button onPress={onCheck} loading={checking} size="lg">
				I've verified — continue
			</Button>
			<View className="h-3" />
			<Button onPress={onResend} loading={resending} variant="outline">
				Resend the email
			</Button>
			<View className="h-3" />
			<Button onPress={signOut} variant="ghost">
				Use a different account
			</Button>
		</View>
	);
}
