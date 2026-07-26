/**
 * The bearer token the API client sends.
 *
 * Normally this comes from Firebase (see api.ts). The dev bypass sets a
 * stand-in `dev:<slug>` token here instead, which the backend accepts only when
 * DEV_AUTH_BYPASS is on. This exists purely so the app can be built and tested
 * before real ASU accounts exist.
 *
 * The token is persisted to `localStorage` on web so a full page reload (or a
 * Metro Fast Refresh, which resets module state) doesn't silently sign the dev
 * user out and 401 the next request. On native `localStorage` is absent, so it
 * falls back to in-memory — fine, since the dev bypass is a web testing aid.
 */

const STORAGE_KEY = "ecoeats.devToken";

function readStored(): string | null {
	try {
		if (typeof localStorage !== "undefined") {
			return localStorage.getItem(STORAGE_KEY);
		}
	} catch {
		// Access can throw in locked-down/private modes; treat as no token.
	}
	return null;
}

let devToken: string | null = readStored();

export function setDevToken(token: string | null): void {
	devToken = token;
	try {
		if (typeof localStorage !== "undefined") {
			if (token) localStorage.setItem(STORAGE_KEY, token);
			else localStorage.removeItem(STORAGE_KEY);
		}
	} catch {
		// Persistence is best-effort; the in-memory value still works this session.
	}
}

export function getDevToken(): string | null {
	return devToken;
}
