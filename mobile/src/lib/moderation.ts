/**
 * Reporting a listing and blocking a person.
 *
 * Separate from `listings.ts` because these are not part of the food flow:
 * they are what someone reaches for when the flow has gone wrong, and keeping
 * them apart means the feed code never has to think about moderation.
 */

import { api } from "@/lib/api";

/**
 * Why a listing is being reported.
 *
 * Ordered by how urgently a human should look, not alphabetically — unsafe
 * food is the only one on this list that can put somebody in hospital, so it
 * leads both the type and the picker built from it.
 */
export const REPORT_REASONS = [
	{ value: "unsafe_food", label: "Unsafe or wrongly described food" },
	{ value: "offensive", label: "Offensive or abusive content" },
	{ value: "harassment", label: "Harassment" },
	{ value: "misleading", label: "Misleading or not really available" },
	{ value: "spam", label: "Spam or selling" },
	{ value: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export interface BlockedUser {
	user_id: string;
	display_name: string | null;
	blocked_at: string;
}

/**
 * Report a listing.
 *
 * Resolves on success and tells the caller nothing about what happened next —
 * the server deliberately does not say whether the listing was removed, since
 * that would make reporting a way to probe other people's accounts.
 *
 * `detail` is required by the server when the reason is `other`; the picker
 * enforces the same rule so the failure never reaches the network.
 */
export async function reportListing(
	listingId: string,
	reason: ReportReason,
	detail?: string,
): Promise<void> {
	await api.post<unknown>(`/listings/${listingId}/report`, {
		reason,
		detail: detail?.trim() ? detail.trim() : undefined,
	});
}

/**
 * Block someone.
 *
 * Their food disappears from your feed and yours from theirs, and neither of
 * you can claim the other's. Blocking twice is a no-op rather than an error,
 * so a double-tap never reads as a failure.
 */
export async function blockUser(userId: string): Promise<void> {
	await api.post<void>(`/users/${userId}/block`);
}

/** Undo a block. A no-op if they were not blocked. */
export async function unblockUser(userId: string): Promise<void> {
	await api.del<void>(`/users/${userId}/block`);
}

/** Who you have blocked, so a block can be undone. Only blocks you made. */
export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
	const body = await api.get<{ items: BlockedUser[]; count: number }>(
		"/users/me/blocks",
	);
	return body.items;
}
