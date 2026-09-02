/**
 * Typed client for the EcoEats API.
 *
 * Every request carries the current Firebase ID token as a bearer credential;
 * the backend verifies it and applies the verified-email rule. The
 * token is fetched fresh from Firebase on each call — the SDK caches it and
 * refreshes it as needed, so this is cheap and always current.
 */

import { config } from "@/config";
import { auth } from "@/lib/firebase";
import { getDevToken } from "@/lib/session";

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "ApiError";
	}
}

/** Raised on a 404 from the profile endpoint: valid token, no profile yet. */
export class ProfileNotFoundError extends ApiError {}

/** The current bearer token — dev stand-in or a fresh Firebase ID token. */
export async function currentBearerToken(): Promise<string | null> {
	const dev = getDevToken();
	if (dev) return dev;

	const user = auth.currentUser;
	if (!user) return null;
	return user.getIdToken();
}

async function authHeader(): Promise<Record<string, string>> {
	const token = await currentBearerToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${config.apiBase}${path}`, {
			method,
			headers: {
				"Content-Type": "application/json",
				...(await authHeader()),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch {
		throw new ApiError(
			"Can't reach the server. Check your connection and try again.",
			0,
		);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		const message =
			(payload && typeof payload === "object" && "message" in payload
				? String((payload as { message: unknown }).message)
				: null) ?? "Request failed";
		if (response.status === 404) {
			throw new ProfileNotFoundError(message, 404);
		}
		throw new ApiError(message, response.status);
	}

	return payload as T;
}

export const api = {
	get: <T>(path: string) => request<T>("GET", path),
	post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
	patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
	// A body is optional and rarely used, but unregistering a device has to say
	// which token — and it isn't safe in a path segment, where an Expo token's
	// brackets would need encoding by every caller.
	del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

// --- Shapes mirrored from the backend Pydantic schemas --------------------

export type UserRole = "organizer" | "recipient";

export interface UserProfile {
	id: string;
	email: string;
	name: string;
	avatar_url: string | null;
	role: UserRole;
	dietary_prefs: string[];
	created_at: string;

	terms_accepted_at: string | null;
	terms_version: string | null;
	/** Which roles this user has accepted the terms as. A host and a recipient
	 *  agree to different obligations, so the first switch asks again. */
	terms_accepted_roles: string[];
	/** Whether the accepted version is the one currently in force. The server
	 *  decides this, so bumping the terms takes effect without a client
	 *  release. */
	terms_current: boolean;
}

export async function fetchProfile(): Promise<UserProfile> {
	return api.get<UserProfile>("/users/me");
}

/**
 * Record that this user accepted the terms now in force.
 *
 * No version is sent: the server stamps what it is actually serving. A client
 * that named the version could claim to have accepted a document it never
 * displayed, which is the one thing this record exists to rule out.
 */
export async function acceptTerms(): Promise<UserProfile> {
	return api.post<UserProfile>("/users/me/terms", {});
}

/**
 * Delete this account and everything belonging to it, permanently.
 *
 * The sign-in identity goes too, so the same email can start over as a new
 * account rather than returning to a half-deleted one.
 */
export async function deleteAccount(): Promise<void> {
	await api.del<void>("/users/me");
}

export async function registerProfile(
	role: UserRole,
	name?: string,
): Promise<UserProfile> {
	return api.post<UserProfile>("/users/me", { role, name });
}

export async function updateProfile(patch: {
	name?: string;
	dietary_prefs?: string[];
}): Promise<UserProfile> {
	return api.patch<UserProfile>("/users/me", patch);
}

/**
 * Switch account type.
 *
 * Deliberately not part of `updateProfile`: the server refuses this with a 409
 * while the account still has food in flight — a host with live posts, or a
 * recipient holding a reserved portion — because the two roles are the two
 * halves of a handover. Callers must be ready for that rejection and show its
 * message, which names exactly what is outstanding.
 *
 * Asking for the role you already have is a no-op, not an error, so a caller
 * never has to check first.
 *
 * POST rather than PUT: the API's CORS allowlist carries no PUT, and a PUT here
 * failed the browser preflight while passing every test — pytest sends no
 * preflight and this module is mocked under Jest. State transitions on this API
 * are POSTs anyway (see the claim pickup/cancel routes).
 */
export async function changeRole(role: UserRole): Promise<UserProfile> {
	return api.post<UserProfile>("/users/me/role", { role });
}
