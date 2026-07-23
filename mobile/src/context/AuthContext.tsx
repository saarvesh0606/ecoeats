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
	useState,
} from "react";
import {
	type FirebaseUser,
	reloadUser,
	signOut as fbSignOut,
	watchAuth,
} from "@/lib/firebase";
import {
	fetchProfile,
	ProfileNotFoundError,
	type UserProfile,
} from "@/lib/api";

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
	setProfile: (profile: UserProfile) => void;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [status, setStatus] = useState<AuthStatus>("loading");

	/** Resolve the full status for a given Firebase user. */
	const resolve = useCallback(async (user: FirebaseUser | null) => {
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

		try {
			const loaded = await fetchProfile();
			setProfile(loaded);
			setStatus("ready");
		} catch (error) {
			if (error instanceof ProfileNotFoundError) {
				setProfile(null);
				setStatus("needs-profile");
			} else {
				// A network or server error shouldn't strand a verified user on a
				// blank screen — send them to role selection, which retries.
				setProfile(null);
				setStatus("needs-profile");
			}
		}
	}, []);

	useEffect(() => {
		return watchAuth((user) => {
			setFirebaseUser(user);
			void resolve(user);
		});
	}, [resolve]);

	const refresh = useCallback(async () => {
		const user = await reloadUser();
		setFirebaseUser(user);
		await resolve(user);
	}, [resolve]);

	const signOut = useCallback(async () => {
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
				setProfile,
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
