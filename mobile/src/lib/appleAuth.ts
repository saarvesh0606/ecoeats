import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

/** Apple's cancel code. Backing out is a decision, not a failure. */
export const APPLE_CANCELLED = "ERR_REQUEST_CANCELED";

export interface AppleCredentialResult {
	identityToken: string;
	/** The UNHASHED nonce. Firebase hashes it again to compare. */
	rawNonce: string;
	/** Present on a first authorisation only — null every time after. */
	fullName: string | null;
}

/**
 * Ask Apple to authorise, and hand back what Firebase needs.
 *
 * Shared by signing in and by linking, because the part that is easy to get
 * wrong is identical in both and must not be written twice: **the nonce is
 * used in two forms.** Apple is given the SHA-256 and embeds it in the identity
 * token; Firebase is given the raw string and hashes it again to compare.
 * Passing the same form to both ends fails with an opaque credential error that
 * never mentions the nonce.
 *
 * Throws with `code === APPLE_CANCELLED` when the user backs out.
 */
export async function requestAppleCredential(): Promise<AppleCredentialResult> {
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
		throw new Error("Apple didn't return a sign-in token. Try again.");
	}

	// Either half can be missing on its own.
	const name = [
		credential.fullName?.givenName,
		credential.fullName?.familyName,
	]
		.filter(Boolean)
		.join(" ");

	return {
		identityToken: credential.identityToken,
		rawNonce,
		fullName: name || null,
	};
}

/** Whether this OS offers Sign in with Apple at all (iOS 13+). */
export async function appleSignInAvailable(): Promise<boolean> {
	try {
		return await AppleAuthentication.isAvailableAsync();
	} catch {
		// Unavailable is the safe reading of a failed check — better a missing
		// button than one that throws when pressed.
		return false;
	}
}
