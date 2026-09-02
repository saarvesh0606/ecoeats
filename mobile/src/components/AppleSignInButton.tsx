import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui/Button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { authErrorMessage, completeAppleSignIn } from "@/lib/firebase";

/** Apple's cancel code. Backing out is a decision, not a failure. */
const CANCELLED = "ERR_REQUEST_CANCELED";

/**
 * "Continue with Apple" — iOS only, and only where the OS actually offers it.
 *
 * Rendered behind `isAvailableAsync`, which is false on Android, on the web and
 * on iOS before 13. That gate is doing more than hiding a dead button: the web
 * and Android flows would need an Apple *Services ID* and a signing key
 * configured in Firebase, and the native iOS flow needs neither — enabling
 * Apple as a provider is enough. Keeping this to iOS keeps that setup out of
 * the project entirely.
 *
 * Apple requires this button once an app offers any other third-party sign-in,
 * so it is a store-review requirement, not only a convenience.
 */
export function AppleSignInButton({
	onError,
}: {
	onError: (message: string | null) => void;
}) {
	const [available, setAvailable] = useState(false);
	const [loading, setLoading] = useState(false);
	// An icon takes a colour prop, not a className, so the CSS variables that
	// flip the rest of the app never reach it. Left as a hex it stays put and
	// the black Apple mark vanishes into the dark page — which is exactly what
	// happened on hardware. `brand` is what this button's own label uses
	// (`text-brand` on the outline variant), so the glyph and the words beside
	// it now move together.
	const colors = useThemeColors();

	useEffect(() => {
		let alive = true;
		AppleAuthentication.isAvailableAsync()
			.then((ok) => {
				if (alive) setAvailable(ok);
			})
			.catch(() => {
				// Unavailable is the safe reading of a failed check — better a
				// missing button than one that throws when pressed.
				if (alive) setAvailable(false);
			});
		return () => {
			alive = false;
		};
	}, []);

	async function onPress() {
		onError(null);
		setLoading(true);
		try {
			// Apple sees the hash; Firebase is given the raw value and hashes it
			// again to compare. Sending the same form to both fails every time.
			const rawNonce = Crypto.randomUUID();
			const hashedNonce = await Crypto.digestStringAsync(
				Crypto.CryptoDigestAlgorithm.SHA256,
				rawNonce,
			);

			const credential = await AppleAuthentication.signInAsync({
				requestedScopes: [
					AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
					AppleAuthentication.AppleAuthenticationScope.EMAIL,
				],
				nonce: hashedNonce,
			});

			if (!credential.identityToken) {
				onError("Apple didn't return a sign-in token. Try again.");
				return;
			}

			// Present only on the first authorisation, and either half can be
			// missing on its own.
			const name = [
				credential.fullName?.givenName,
				credential.fullName?.familyName,
			]
				.filter(Boolean)
				.join(" ");

			await completeAppleSignIn({
				identityToken: credential.identityToken,
				rawNonce,
				fullName: name || null,
			});
		} catch (err) {
			const code =
				typeof err === "object" && err !== null && "code" in err
					? String((err as { code: unknown }).code)
					: "";
			if (code === CANCELLED) return; // said no; say nothing back
			onError(
				err instanceof Error && !("code" in err)
					? err.message
					: authErrorMessage(err),
			);
		} finally {
			setLoading(false);
		}
	}

	if (!available) return null;

	return (
		<Button
			variant="outline"
			size="lg"
			loading={loading}
			onPress={() => void onPress()}
			icon={<Ionicons name="logo-apple" size={18} color={colors.brand} />}
		>
			Continue with Apple
		</Button>
	);
}
