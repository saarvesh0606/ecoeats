import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui/Button";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
	APPLE_CANCELLED,
	appleSignInAvailable,
	flushAppleAuthorization,
	holdAppleAuthorization,
	requestAppleCredential,
} from "@/lib/appleAuth";
import { authErrorMessage, completeAppleSignIn } from "@/lib/firebase";

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
		appleSignInAvailable().then((ok) => {
			if (alive) setAvailable(ok);
		});
		return () => {
			alive = false;
		};
	}, []);

	async function onPress() {
		onError(null);
		setLoading(true);
		try {
			const { identityToken, rawNonce, fullName, authorizationCode } =
				await requestAppleCredential();
			await completeAppleSignIn({ identityToken, rawNonce, fullName });

			// Held rather than sent: a brand new account has no profile for the
			// server to attach it to yet, and role selection flushes it after
			// registering. For a returning user the flush below spends it now.
			holdAppleAuthorization(authorizationCode);
			await flushAppleAuthorization();
		} catch (err) {
			const code =
				typeof err === "object" && err !== null && "code" in err
					? String((err as { code: unknown }).code)
					: "";
			if (code === APPLE_CANCELLED) return; // said no; say nothing back
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
