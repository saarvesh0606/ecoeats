/**
 * Typed client for the EcoEats API.
 *
 * Every request carries the current Firebase ID token as a bearer credential;
 * the backend verifies it and applies the ASU + verified-email rules. The
 * token is fetched fresh from Firebase on each call — the SDK caches it and
 * refreshes it as needed, so this is cheap and always current.
 */

import { auth } from "@/lib/firebase";
import { getDevToken } from "@/lib/session";
import { config } from "@/config";

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

async function authHeader(): Promise<Record<string, string>> {
	// Dev bypass wins when active — it stands in for Firebase entirely.
	const dev = getDevToken();
	if (dev) return { Authorization: `Bearer ${dev}` };

	const user = auth.currentUser;
	if (!user) return {};
	const token = await user.getIdToken();
	return { Authorization: `Bearer ${token}` };
}

async function request<T>(
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${config.apiUrl}${path}`, {
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
}

export async function fetchProfile(): Promise<UserProfile> {
	return api.get<UserProfile>("/users/me");
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
