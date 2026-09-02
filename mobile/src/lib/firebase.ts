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
	createUserWithEmailAndPassword,
	type User as FirebaseUser,
	signOut as fbSignOut,
	GoogleAuthProvider,
	getAuth,
	initializeAuth,
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
