import { useState } from "react";
import { Text, View } from "react-native";
import { AuthBrand } from "@/components/AuthBrand";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";

/**
 * Shown when we know who the user is but could not load their account.
 *
 * Deliberately NOT role selection: the account exists, so offering to create
 * one sends them into a 409 they cannot get past. The only honest options are
 * to try again or to sign out.
 */
export default function ConnectionProblemScreen() {
	const { refresh, signOut } = useAuth();
	const [retrying, setRetrying] = useState(false);

	async function onRetry() {
		setRetrying(true);
		try {
			// The gate moves us off this screen as soon as the profile loads.
			await refresh();
		} finally {
			setRetrying(false);
		}
	}

	return (
		<View className="flex-1 bg-page justify-center px-6">
			<AuthBrand />
			<Text className="text-2xl font-semibold text-ink text-center mt-8">
				Can't load your account
			</Text>
			<Text className="text-base text-ink-muted text-center mt-3">
				You're still signed in — we just couldn't reach the server. Check
				your connection and try again.
			</Text>
			<Button onPress={onRetry} loading={retrying} className="mt-8">
				Try again
			</Button>
			<Button variant="ghost" onPress={signOut} className="mt-3">
				Sign out
			</Button>
		</View>
	);
}
