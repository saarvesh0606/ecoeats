import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { sendAppleAuthorization } from "@/lib/api";

/** Apple's cancel code. Backing out is a decision, not a failure. */
export const APPLE_CANCELLED = "ERR_REQUEST_CANCELED";

export interface AppleCredentialResult {
	identityToken: string;
	/** The UNHASHED nonce. Firebase hashes it again to compare. */
	rawNonce: string;
	/** Present on a first authorisation only — null every time after. */
	fullName: string | null;
	/**
	 * One-shot code the server trades for a refresh token, so a later account
	 * deletion can revoke this authorisation — which Apple requires. Valid for
	 * five minutes and once only, so it has to be spent now, not stored.
	 */
	authorizationCode: string | null;
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
		authorizationCode: credential.authorizationCode ?? null,
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


/**
 * The code from the sign-in just completed, waiting for a profile to attach to.
 *
 * Apple hands the code over during sign-in, but a brand new user has no
 * profile yet — they are on their way to role selection — and the endpoint
 * that spends it needs one. So it is held here across those few seconds and
 * flushed from both places that can follow a sign-in.
 *
 * In memory only, deliberately. It is a credential with a five-minute life and
 * no value after it is spent; writing it to disk would give it a longer one.
 */
let pendingCode: string | null = null;

export function holdAppleAuthorization(code: string | null): void {
	pendingCode = code;
}

/**
 * Spend the held code, if there is one. Never throws.
 *
 * Failure costs a revocation later, not a way in now — so this is called for
 * its effect and its outcome is ignored. The code is dropped either way: it is
 * one-shot, so a retry would fail regardless.
 */
export async function flushAppleAuthorization(): Promise<void> {
	const code = pendingCode;
	pendingCode = null;
	if (!code) return;
	try {
		await sendAppleAuthorization(code);
	} catch {
		// Nothing to do and nothing worth telling the user.
	}
}
