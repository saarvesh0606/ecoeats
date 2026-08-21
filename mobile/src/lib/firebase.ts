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
	getAuth,
	GoogleAuthProvider,
	initializeAuth,
	onAuthStateChanged,
	type Persistence,
	sendEmailVerification,
	signInWithEmailAndPassword,
	signInWithPopup,
	signOut as fbSignOut,
	updateProfile,
	type User as FirebaseUser,
} from "firebase/auth";
import { Platform } from "react-native";
import { ALLOWED_EMAIL_DOMAIN, config } from "@/config";

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

/**
 * A friendly message for the Firebase error codes users actually hit, instead
 * of leaking "auth/invalid-credential" into the UI.
 */
export function authErrorMessage(error: unknown): string {
	const code =
		typeof error === "object" && error !== null && "code" in error
			? String((error as { code: unknown }).code)
			: "";

	switch (code) {
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

/** Google sign-in is only wired for web; native needs expo-auth-session. */
export const googleSignInSupported = Platform.OS === "web";

/**
 * Sign in with Google, then hold the result to the same rule as email sign-up.
 *
 * The API only accepts @asu.edu identities, so a personal Google account would
 * authenticate here and then be refused by every request. Catching it now — and
 * signing the account back out — gives one clear message instead of an app that
 * looks logged in but can't load anything.
 */
export async function signInWithGoogle(): Promise<void> {
	const provider = new GoogleAuthProvider();
	// Nudge Google's own picker toward the right account.
	provider.setCustomParameters({ hd: ALLOWED_EMAIL_DOMAIN });

	const credential = await signInWithPopup(auth, provider);
	const email = credential.user.email ?? "";

	if (!email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
		await fbSignOut(auth);
		throw new Error(
			`That Google account isn't an @${ALLOWED_EMAIL_DOMAIN} address. ` +
				"Use your ASU account.",
		);
	}
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
