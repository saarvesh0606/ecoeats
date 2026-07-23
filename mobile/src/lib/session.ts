/**
 * The bearer token the API client sends.
 *
 * Normally this comes from Firebase (see api.ts). The dev bypass sets a
 * stand-in `dev:<slug>` token here instead, which the backend accepts only when
 * DEV_AUTH_BYPASS is on. This exists purely so the app can be built and tested
 * before real ASU accounts exist.
 */

let devToken: string | null = null;

export function setDevToken(token: string | null): void {
	devToken = token;
}

export function getDevToken(): string | null {
	return devToken;
}
