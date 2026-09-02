const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns an error message, or null when the email is usable.
 *
 * Shape only — no domain rule. Any restriction belongs to the backend
 * (ALLOWED_EMAIL_DOMAIN), which is the side that can actually enforce one;
 * duplicating it here would only mean two places to change and a client that
 * refuses addresses the server would happily accept.
 */
export function validateEmail(email: string): string | null {
	const value = email.trim().toLowerCase();
	if (!value) return "Email is required.";
	if (!EMAIL_RE.test(value)) return "That email address doesn't look right.";
	return null;
}

export function validatePassword(password: string): string | null {
	if (password.length < 6) {
		return "Password must be at least 6 characters.";
	}
	return null;
}
