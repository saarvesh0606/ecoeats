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
import {
	type FirebaseUser,
	reloadUser,
	signOut as fbSignOut,
	watchAuth,
} from "@/lib/firebase";
import { fetchProfile, type UserProfile } from "@/lib/api";
import { getDevToken, setDevToken } from "@/lib/session";

export type AuthStatus =
	| "loading" // still resolving Firebase + profile
	| "signed-out" // no Firebase user
	| "unverified" // signed in, email not confirmed
	| "needs-profile" // verified, but hasn't chosen a role
	| "ready"; // verified, has a profile

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
	/** Dev-only: authenticate with a `dev:<slug>` stand-in token. */
	devSignIn: (slug: string) => Promise<void>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [status, setStatus] = useState<AuthStatus>("loading");

	// While a dev session is active, Firebase auth changes are ignored so they
	// can't knock the user back to signed-out. A ref because the watchAuth
	// callback closes over it and must see the current value. Seeded from the
	// persisted dev token so a page reload restores the dev session instead of
	// racing Firebase to "signed-out".
	const devActive = useRef(getDevToken() !== null);

	/** Fetch the profile for an already-verified identity. */
	const resolveProfile = useCallback(async () => {
		try {
			const loaded = await fetchProfile();
			setProfile(loaded);
			setStatus("ready");
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
		setStatus("ready");
	}, []);

	const applyProfile = useCallback((updated: UserProfile) => {
		setProfile(updated);
	}, []);

	const signOut = useCallback(async () => {
		devActive.current = false;
		setDevToken(null);
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
