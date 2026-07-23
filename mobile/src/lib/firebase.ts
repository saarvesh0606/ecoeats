/**
 * Firebase initialisation and the auth calls the app makes.
 *
 * The client's whole job with Firebase is to prove who the user is and get an
 * ID token. Everything else — profiles, listings, claims — goes through our own
 * API, which verifies that token. The client never talks to Firestore or any
 * other Firebase data service.
 */

import { getApp, getApps, initializeApp } from "firebase/app";
import {
	createUserWithEmailAndPassword,
	getAuth,
	onAuthStateChanged,
	sendEmailVerification,
	signInWithEmailAndPassword,
	signOut as fbSignOut,
	type User as FirebaseUser,
} from "firebase/auth";
import { config } from "@/config";

const app = getApps().length ? getApp() : initializeApp(config.firebase);

export const auth = getAuth(app);

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
		default:
			return "Something went wrong. Please try again.";
	}
}

export async function registerWithEmail(
	email: string,
	password: string,
): Promise<FirebaseUser> {
	const credential = await createUserWithEmailAndPassword(
		auth,
		email,
		password,
	);
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
