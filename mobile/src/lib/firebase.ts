/**
 * Firebase initialisation and the auth calls the app makes.
 *
 * The client's whole job with Firebase is to prove who the user is and get an
 * ID token. Everything else — profiles, listings, claims — goes through our own
 * API, which verifies that token. The client never talks to Firestore or any
 * other Firebase data service.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import * as firebaseAuth from "firebase/auth";
import {
	type AuthCredential,
	createUserWithEmailAndPassword,
	type User as FirebaseUser,
	signOut as fbSignOut,
	GoogleAuthProvider,
	getAuth,
	initializeAuth,
	linkWithCredential,
	OAuthProvider,
	onAuthStateChanged,
	type Persistence,
	sendEmailVerification,
	sendPasswordResetEmail,
	signInWithCredential,
	signInWithEmailAndPassword,
	signInWithPopup,
	updateProfile,
} from "firebase/auth";
import { Platform } from "react-native";
import { config } from "@/config";

const app = getApps().length ? getApp() : initializeApp(config.firebase);

/**
 * Auth, with a session that outlives the app process.
 *
 * `getAuth()` on native defaults to **in-memory** persistence: the session
 * lasts exactly as long as the JS runtime, so force-quitting the app signed the
 * user out every single time. The browser build persists to `localStorage` by
 * itself, which is precisely why months of web testing never showed this — the
 * same blind spot as the untappable buttons and the CORS methods.
 *
 * `getReactNativePersistence` ships only in the react-native build of
 * `firebase/auth`; the browser bundle doesn't export it and the published types
 * don't declare it. Reading it off the namespace keeps one import that resolves
 * correctly on both platforms, rather than a bare `require` the web bundler
 * would have to be told to ignore.
 */
function createAuth() {
	const rnPersistence = (
		firebaseAuth as unknown as {
			getReactNativePersistence?: (storage: unknown) => Persistence;
		}
	).getReactNativePersistence;

	if (Platform.OS === "web" || !rnPersistence) return getAuth(app);

	try {
		return initializeAuth(app, { persistence: rnPersistence(AsyncStorage) });
	} catch {
		// Already initialised — this module re-ran under Fast Refresh. The
		// existing instance keeps the persistence it was built with, so handing
		// it back is correct rather than merely harmless.
		return getAuth(app);
	}
}

export const auth = createAuth();

export type { FirebaseUser };

/** The `auth/...` code off a Firebase error, or "" for anything else. */
function errorCode(error: unknown): string {
	return typeof error === "object" && error !== null && "code" in error
		? String((error as { code: unknown }).code)
		: "";
}

/**
 * A friendly message for the Firebase error codes users actually hit, instead
 * of leaking "auth/invalid-credential" into the UI.
 */
export function authErrorMessage(error: unknown): string {
	switch (errorCode(error)) {
		case "auth/invalid-email":
			return "That email address doesn't look right.";
		case "auth/email-already-in-use":
			return "An account already exists for this email. Try signing in.";
		case "auth/weak-password":
			return "Choose a password of at least 6 characters.";
		case "auth/invalid-credential":
		case "auth/wrong-password":
		case "auth/user-not-found":
			return "Email or password is incorrect.";
		case "auth/too-many-requests":
			return "Too many attempts. Wait a moment and try again.";
		case "auth/network-request-failed":
			return "Network problem. Check your connection and try again.";
		case "auth/popup-closed-by-user":
		case "auth/cancelled-popup-request":
			return "Sign-in was cancelled.";
		case "auth/popup-blocked":
			return "Your browser blocked the sign-in window. Allow popups and retry.";
		case "auth/operation-not-allowed":
			// Says exactly what to do: this one is a console switch, not a bug.
			return "Google sign-in isn't enabled for this project yet.";
		default:
			return "Something went wrong. Please try again.";
	}
}

/**
 * Whether to offer the Google button at all.
 *
 * Web has always had it, through the popup below. Native goes via
 * expo-auth-session, which needs OAuth client ids — so on a phone the button
 * appears only once those are configured. Offering a button that cannot work
 * is worse than not offering one.
 */
export const googleSignInSupported =
	Platform.OS === "web" ||
	Boolean(config.google.iosClientId && config.google.webClientId);

/**
 * Sign in with Google.
 *
 * No domain filtering here, deliberately. There used to be: the account was
 * held to one university domain and signed back out if it did not match. The
 * app accepts any verified address now, and an `hd` hint would hide most
 * people's own account from Google's picker. Any restriction is the backend's
 * to apply (ALLOWED_EMAIL_DOMAIN), because only the backend can enforce one.
 */
export async function signInWithGoogle(): Promise<void> {
	const provider = new GoogleAuthProvider();
	await signInWithPopup(auth, provider);
}

/**
 * Finish a native Google sign-in from the id token expo-auth-session returned.
 *
 * Split from signInWithGoogle rather than folded into it because the two halves
 * differ: the web popup both authenticates and returns a credential, while on
 * native the browser hands back an id token that still has to be exchanged with
 * Firebase.
 */
export async function completeGoogleSignIn(idToken: string): Promise<void> {
	await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

/**
 * Finish a Sign in with Apple, from what expo-apple-authentication returned.
 *
 * Two things about Apple that do not apply to Google, and that both fail
 * quietly if you get them wrong:
 *
 * **The nonce is used twice, in two forms.** Apple is handed the SHA-256 of a
 * random string and puts that hash inside the identity token; Firebase is
 * handed the *raw* string and hashes it again to compare. Passing the same
 * form to both — either form — makes every sign-in fail with an opaque
 * credential error, so the hashing lives at the call site and the raw value
 * arrives here.
 *
 * **The name comes back exactly once.** Apple includes givenName/familyName
 * only on the very first authorisation for an app; every sign-in afterwards
 * returns null for them, and reinstalling does not reset it. Firebase does not
 * store it either. So if it is present it must be written to the profile now —
 * there is no second chance to read it, and the alternative is an account with
 * no display name forever.
 */
export async function completeAppleSignIn({
	identityToken,
	rawNonce,
	fullName,
}: {
	identityToken: string;
	rawNonce: string;
	fullName?: string | null;
}): Promise<void> {
	const provider = new OAuthProvider("apple.com");
	const credential = await signInWithCredential(
		auth,
		provider.credential({ idToken: identityToken, rawNonce }),
	);

	// Only on a first authorisation, and only when Apple actually gave a name —
	// never overwrite one the account already has with a later empty response.
	const name = fullName?.trim();
	if (name && !credential.user.displayName) {
		try {
			await updateProfile(credential.user, { displayName: name });
		} catch {
			// A profile write failing must not fail the sign-in: the user is
			// authenticated either way, and our own API asks for a name at role
			// selection anyway.
		}
	}
}

/**
 * Which ways in this account already has.
 *
 * Firebase keys these as provider ids; the app talks about "Apple" and
 * "Google", so the mapping stays here rather than in a screen.
 */
export function linkedProviders(): string[] {
	return auth.currentUser?.providerData.map((p) => p.providerId) ?? [];
}

export const APPLE_PROVIDER = "apple.com";
export const GOOGLE_PROVIDER = "google.com";
export const PASSWORD_PROVIDER = "password";

/**
 * Attach another way of signing in to the account already signed in.
 *
 * This is the answer to duplicate accounts, and the reason it has to be done
 * from *inside* an account rather than at sign-in: `linkWithCredential` adds a
 * provider to the CURRENT user and leaves the uid alone. The uid is our
 * `User.id`, so the EcoEats account — its listings, claims, ratings, history —
 * is untouched and simply gains another door.
 *
 * The failure that matters is `auth/credential-already-in-use`: that identity
 * is already its own Firebase account. Nothing here can safely absorb it,
 * because it may have its own listings and claims, so it is reported plainly
 * rather than forced.
 */
export async function linkCredential(credential: AuthCredential): Promise<void> {
	const user = auth.currentUser;
	if (!user) throw new Error("Sign in first.");
	await linkWithCredential(user, credential);
}

/** Build the Apple credential from what expo-apple-authentication returned. */
export function appleCredential(
	identityToken: string,
	rawNonce: string,
): AuthCredential {
	return new OAuthProvider(APPLE_PROVIDER).credential({
		idToken: identityToken,
		rawNonce,
	});
}

/** Build the Google credential from an id token. */
export function googleCredential(idToken: string): AuthCredential {
	return GoogleAuthProvider.credential(idToken);
}

export async function registerWithEmail(
	email: string,
	password: string,
	name?: string,
): Promise<FirebaseUser> {
	const credential = await createUserWithEmailAndPassword(
		auth,
		email,
		password,
	);
	// Carry the typed name onto the Firebase user so role selection can seed the
	// profile with it, instead of asking for the same thing twice.
	if (name) {
		await updateProfile(credential.user, { displayName: name });
	}
	// Fire off the verification email immediately. The backend refuses any
	// token whose email is unverified, so this is not optional.
	await sendEmailVerification(credential.user);
	return credential.user;
}

export async function signInWithEmail(
	email: string,
	password: string,
): Promise<FirebaseUser> {
	const credential = await signInWithEmailAndPassword(auth, email, password);
	return credential.user;
}

export async function resendVerification(): Promise<void> {
	if (auth.currentUser) {
		await sendEmailVerification(auth.currentUser);
	}
}

/**
 * Send a password-reset link, and say nothing about whether the account exists.
 *
 * Firebase throws `auth/user-not-found` for an address it has never seen.
 * Surfacing that difference turns the reset screen into an oracle: type
 * addresses, watch which ones error, and you have enumerated who on campus has
 * an EcoEats account. Firebase's own email-enumeration protection defends the
 * same thing, but it is a console toggle this code cannot see the state of, so
 * the guarantee is made here rather than assumed of a setting.
 *
 * The price is that a typo looks exactly like success, which is why the screen
 * echoes the address back instead of saying a bare "sent".
 *
 * Nothing else is swallowed. A rate limit or a dead network is the user's
 * problem to see and act on, not a secret worth keeping.
 *
 * ⚠ This mail rides the same sender as the verification mail, so until
 * custom SMTP is configured it lands in spam on Gmail and is silently
 * quarantined by university gateways. The screen has to say so.
 */
export async function sendPasswordReset(email: string): Promise<void> {
	try {
		await sendPasswordResetEmail(auth, email);
	} catch (error) {
		if (errorCode(error) === "auth/user-not-found") return;
		throw error;
	}
}

export async function signOut(): Promise<void> {
	await fbSignOut(auth);
}

/** Re-fetch the user from Firebase so a just-clicked verification is seen. */
export async function reloadUser(): Promise<FirebaseUser | null> {
	if (!auth.currentUser) return null;
	await auth.currentUser.reload();
	return auth.currentUser;
}

export function watchAuth(
	callback: (user: FirebaseUser | null) => void,
): () => void {
	return onAuthStateChanged(auth, callback);
}
