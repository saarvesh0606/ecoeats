import { ALLOWED_EMAIL_DOMAIN } from "@/config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns an error message, or null when the email is a valid ASU address. */
export function validateAsuEmail(email: string): string | null {
	const value = email.trim().toLowerCase();
	if (!value) return "Email is required.";
	if (!EMAIL_RE.test(value)) return "That email address doesn't look right.";
	if (!value.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
		return `EcoEats is for ASU — use your @${ALLOWED_EMAIL_DOMAIN} email.`;
	}
	return null;
}

export function validatePassword(password: string): string | null {
	if (password.length < 6) {
		return "Password must be at least 6 characters.";
	}
	return null;
}
