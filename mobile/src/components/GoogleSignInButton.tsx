import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Image, Platform } from "react-native";
import { Button } from "@/components/ui/Button";
import { config } from "@/config";
import {
	authErrorMessage,
	completeGoogleSignIn,
	signInWithGoogle,
} from "@/lib/firebase";

// Closes the browser once Google redirects back, handing the result to the
// pending request. Without it the browser sits on a blank page and the sign-in
// looks hung, having actually succeeded.
WebBrowser.maybeCompleteAuthSession();

/**
 * "Continue with Google", on both platforms.
 *
 * Its own component so the hook below is only ever called when the OAuth client
 * ids exist. useIdTokenAuthRequest throws outright when iosClientId is missing,
 * and called from the screen that would be an unconfigured build losing its
 * entire sign-in page rather than merely losing one button. Hooks cannot be
 * called conditionally; components can be mounted conditionally. So the caller
 * checks googleSignInSupported and this never renders without its ids.
 *
 * The two platforms differ in shape, not just in API. The web popup both
 * authenticates and returns a credential, so it is awaited. Native only opens
 * a browser — the answer arrives later as a response object, which is why the
 * result is handled in an effect rather than after the await.
 */
export function GoogleSignInButton({
	onError,
}: {
	onError: (message: string | null) => void;
}) {
	const [loading, setLoading] = useState(false);

	const [, response, prompt] = Google.useIdTokenAuthRequest({
		iosClientId: config.google.iosClientId,
		clientId: config.google.webClientId,
	});

	useEffect(() => {
		if (!response) return;
		if (response.type !== "success") {
			// Dismissing the browser is a decision, not a failure. Stop the spinner
			// and say nothing.
			setLoading(false);
			return;
		}
		const idToken = response.params.id_token;
		if (!idToken) {
			setLoading(false);
			onError("Google didn't return a sign-in token. Try again.");
			return;
		}
		completeGoogleSignIn(idToken)
			.catch((err: unknown) => {
				// The wrong-domain case throws a plain Error whose message already
				// reads well; Firebase's own codes go through the translator.
				onError(
					err instanceof Error && !("code" in err)
						? err.message
						: authErrorMessage(err),
				);
			})
			.finally(() => setLoading(false));
	}, [response, onError]);

	async function onPress() {
		onError(null);
		setLoading(true);

		// Native: this only opens the browser. The result arrives in the effect,
		// so there is nothing to await and nothing to catch here.
		if (Platform.OS !== "web") {
			void prompt();
			return;
		}

		// signInWithPopup does not reliably reject when the window is dismissed:
		// closing it mid-redirect (ASU's SSO lives on its own domain) can leave
		// the promise pending forever, and the button spins with no way back.
		// Focus returning to the app means the popup is gone, so treat that as the
		// cancel signal — after a beat, in case it closed *because* sign-in
		// succeeded and the SDK is still resolving.
		let settled = false;
		// React Native defines a global `window` that has no addEventListener, so
		// existing is not enough to go on — and this call sits outside the try
		// below, where a throw would skip the sign-in entirely rather than surface
		// as an error.
		const canWatchFocus =
			typeof window !== "undefined" &&
			typeof window.addEventListener === "function";
		const onWindowFocus = () => {
			setTimeout(() => {
				if (!settled) setLoading(false);
			}, 1200);
		};
		if (canWatchFocus) window.addEventListener("focus", onWindowFocus);

		try {
			await signInWithGoogle();
		} catch (err) {
			const code =
				typeof err === "object" && err !== null && "code" in err
					? String((err as { code: unknown }).code)
					: "";
			// A dismissed popup isn't an error worth shouting about.
			if (
				code !== "auth/popup-closed-by-user" &&
				code !== "auth/cancelled-popup-request"
			) {
				onError(
					err instanceof Error && !("code" in err)
						? err.message
						: authErrorMessage(err),
				);
			}
		} finally {
			settled = true;
			if (canWatchFocus) window.removeEventListener("focus", onWindowFocus);
			setLoading(false);
		}
	}

	return (
		<Button
			variant="outline"
			size="lg"
			loading={loading}
			onPress={() => void onPress()}
			icon={
				<Image
					source={require("../../assets/google-g.png")}
					style={{ width: 18, height: 18 }}
					resizeMode="contain"
				/>
			}
		>
			Continue with Google
		</Button>
	);
}
