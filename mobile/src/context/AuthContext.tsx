/**
 * The single source of truth for who the user is and where they should be.
 *
 * It combines two facts the app needs together:
 *   1. the Firebase side — is someone signed in, and have they verified email?
 *   2. our side — does that person have a profile (and therefore a role)?
 *
 * From those it derives one `status`, which the router turns into a screen.
 */

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { fetchProfile, type UserProfile } from "@/lib/api";
import {
	type FirebaseUser,
	signOut as fbSignOut,
	reloadUser,
	watchAuth,
} from "@/lib/firebase";
import { applyHapticPreference } from "@/lib/haptics";
import {
	areHapticsMuted,
	arePushNotificationsMuted,
	setPushNotificationsMuted,
} from "@/lib/preferences";
import { registerForPush, unregisterForPush } from "@/lib/push";
import { getDevToken, setDevToken } from "@/lib/session";

export type AuthStatus =
	| "loading" // still resolving Firebase + profile
	| "signed-out" // no Firebase user
	| "unverified" // signed in, email not confirmed
	| "needs-profile" // verified, but hasn't chosen a role
	| "needs-terms" // has a profile, hasn't accepted the terms in force
	| "ready"; // verified, has a profile, terms accepted

interface AuthValue {
	status: AuthStatus;
	firebaseUser: FirebaseUser | null;
	profile: UserProfile | null;
	/** Re-check Firebase verification and reload the profile. */
	refresh: () => Promise<void>;
	/** Record a freshly created profile and move to the ready state. */
	completeProfile: (profile: UserProfile) => void;
	/** Replace the cached profile after an edit (status unchanged). */
	applyProfile: (profile: UserProfile) => void;
	/** Record that the terms in force have been accepted. */
	completeTerms: (profile: UserProfile) => void;
	/** Mute or unmute push on this device, token and all. */
	setPushMuted: (muted: boolean) => Promise<void>;
	/** Dev-only: authenticate with a `dev:<slug>` stand-in token. */
	devSignIn: (slug: string) => Promise<void>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [status, setStatus] = useState<AuthStatus>("loading");

	/** This device's push token, kept so sign-out can hand it back. A ref
	 *  because nothing renders from it. */
	const pushToken = useRef<string | null>(null);

	// While a dev session is active, Firebase auth changes are ignored so they
	// can't knock the user back to signed-out. A ref because the watchAuth
	// callback closes over it and must see the current value. Seeded from the
	// persisted dev token so a page reload restores the dev session instead of
	// racing Firebase to "signed-out".
	const devActive = useRef(getDevToken() !== null);

	/** Fetch the profile for an already-verified identity. */
	const resolveProfile = useCallback(async () => {
		// Hold the app on the splash while this is in flight. Without it the
		// caller's screen stays mounted and idle for as long as the request
		// takes — and on a sleeping free-tier API that is 30–60s, which reads
		// as a sign-in button that did nothing rather than one still working.
		setStatus("loading");
		try {
			const loaded = await fetchProfile();
			setProfile(loaded);
			// Terms come after the profile exists, so acceptance can be recorded
			// against a real account. `terms_current` is the server's judgement,
			// which is what lets updated terms re-prompt without a new release.
			setStatus(loaded.terms_current ? "ready" : "needs-terms");
		} catch {
			// 404 means no profile yet; any other error shouldn't strand a
			// verified user on a blank screen. Both send them to role selection,
			// which retries.
			setProfile(null);
			setStatus("needs-profile");
		}
	}, []);

	/** Resolve status for a given Firebase user. */
	const resolve = useCallback(
		async (user: FirebaseUser | null) => {
			if (!user) {
				setProfile(null);
				setStatus("signed-out");
				return;
			}
			if (!user.emailVerified) {
				setProfile(null);
				setStatus("unverified");
				return;
			}
			await resolveProfile();
		},
		[resolveProfile],
	);

	useEffect(() => {
		// Before any press can happen: haptics fires synchronously and cannot
		// await device storage at the moment of a tap.
		void areHapticsMuted().then(applyHapticPreference);
	}, []);

	useEffect(() => {
		// A persisted dev token means a reload landed mid-session: restore it
		// straight away rather than waiting for (and being overridden by) the
		// Firebase listener, which would otherwise resolve to signed-out.
		if (getDevToken()) {
			void resolveProfile();
		}
	}, [resolveProfile]);

	useEffect(() => {
		return watchAuth((user) => {
			if (devActive.current) return; // dev session owns the state
			setFirebaseUser(user);
			void resolve(user);
		});
	}, [resolve]);

	const devSignIn = useCallback(
		async (slug: string) => {
			devActive.current = true;
			setDevToken(`dev:${slug}`);
			setFirebaseUser(null);
			setStatus("loading");
			await resolveProfile();
		},
		[resolveProfile],
	);

	const refresh = useCallback(async () => {
		const user = await reloadUser();
		setFirebaseUser(user);
		await resolve(user);
	}, [resolve]);

	/** Called after role selection creates the profile. Advances to ready —
	 * setting the profile alone would leave status at needs-profile and strand
	 * the user on the role screen. */
	const completeProfile = useCallback((created: UserProfile) => {
		setProfile(created);
		// A brand-new account has accepted nothing, so this lands on the terms
		// rather than straight in the app. Reading it off the profile means
		// registration doesn't have to know the rule.
		setStatus(created.terms_current ? "ready" : "needs-terms");
	}, []);

	const applyProfile = useCallback((updated: UserProfile) => {
		setProfile(updated);
		// Switching account type comes through here, and a host has not yet
		// agreed to what a host agrees to — the server says so via terms_current.
		// Guarded to the two states this can legitimately move between, so an
		// edit saved mid-sign-in can't knock the user somewhere strange.
		setStatus((current) =>
			current === "ready" || current === "needs-terms"
				? updated.terms_current
					? "ready"
					: "needs-terms"
				: current,
		);
	}, []);

	/** Record acceptance and let the user through. */
	const completeTerms = useCallback((accepted: UserProfile) => {
		setProfile(accepted);
		setStatus("ready");
	}, []);

	// Registered once the account is fully usable, not at launch: the token
	// belongs to an account, and asking a stranger for notification permission
	// before they have even signed in is the surest way to be refused for good.
	useEffect(() => {
		if (status !== "ready") return;
		let cancelled = false;
		void arePushNotificationsMuted().then(async (muted) => {
			// Someone who muted this device must not be re-registered by the next
			// launch, or the switch would appear to forget itself.
			if (muted || cancelled) return;
			const token = await registerForPush();
			if (!cancelled) pushToken.current = token;
		});
		return () => {
			cancelled = true;
		};
	}, [status]);

	/**
	 * Mute or unmute push on this device.
	 *
	 * Muting actually hands the token back rather than merely hiding banners —
	 * a phone that has been silenced should stop receiving, not receive quietly.
	 * Lives here because the token is held here, and two places tracking it
	 * would eventually disagree.
	 */
	const setPushMuted = useCallback(async (muted: boolean) => {
		await setPushNotificationsMuted(muted);
		if (muted) {
			await unregisterForPush(pushToken.current);
			pushToken.current = null;
		} else {
			pushToken.current = await registerForPush();
		}
	}, []);

	const signOut = useCallback(async () => {
		devActive.current = false;
		setDevToken(null);
		// Before Firebase drops the credentials, while the call can still be
		// authorised — otherwise the phone keeps buzzing for an account nobody
		// is signed into.
		await unregisterForPush(pushToken.current);
		pushToken.current = null;
		await fbSignOut();
		setProfile(null);
		setStatus("signed-out");
	}, []);

	return (
		<AuthContext.Provider
			value={{
				status,
				firebaseUser,
				profile,
				refresh,
				completeProfile,
				applyProfile,
				completeTerms,
				setPushMuted,
				devSignIn,
				signOut,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthValue {
	const ctx = useContext(AuthContext);
	if (!ctx) {
		throw new Error("useAuth must be used within AuthProvider");
	}
	return ctx;
}
