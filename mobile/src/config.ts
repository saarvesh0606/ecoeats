/**
 * Client configuration, read from EXPO_PUBLIC_* environment variables.
 *
 * Every value here is bundled into the app and public by design — the Firebase
 * web config is meant to ship in the client. There are no secrets in this file.
 */

function required(name: string, value: string | undefined): string {
	if (!value) {
		throw new Error(
			`Missing ${name}. Copy mobile/.env.example to mobile/.env and fill it in.`,
		);
	}
	return value;
}

export const config = {
	apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000",
	firebase: {
		apiKey: required(
			"EXPO_PUBLIC_FIREBASE_API_KEY",
			process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
		),
		authDomain: required(
			"EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
			process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
		),
		projectId: required(
			"EXPO_PUBLIC_FIREBASE_PROJECT_ID",
			process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
		),
		storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
		messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
		appId: required(
			"EXPO_PUBLIC_FIREBASE_APP_ID",
			process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
		),
	},
} as const;

/** The only email domain allowed to hold an account. Mirrors the backend. */
export const ALLOWED_EMAIL_DOMAIN = "asu.edu";

/**
 * When true, the login screen offers one-tap dev sign-in that skips Firebase.
 * Only works if the backend also has DEV_AUTH_BYPASS on. For building and
 * testing before real ASU accounts exist — never enable in a real build.
 */
export const DEV_AUTH = process.env.EXPO_PUBLIC_DEV_AUTH === "true";
