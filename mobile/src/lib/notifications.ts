/** In-app notifications client — mirrors the backend notification schema. */

import { api, type UserRole } from "@/lib/api";

/**
 * Where a notification about a listing should take this user.
 *
 * A host's notifications are about their own post — someone claimed it, someone
 * rated them — so the recipient's listing screen is the wrong place entirely:
 * it offered them the chance to reserve their own food. They belong on the
 * screen that manages the post, which is where their dashboard already sends
 * them.
 *
 * Shared by the in-app list and the push tap handler on purpose. They were
 * written separately, both hardcoded the recipient route, and a reader would
 * have to know both existed to fix either.
 */
export function listingRouteFor(
	role: UserRole | undefined,
	listingId: string,
): `/manage/${string}` | `/listing/${string}` {
	// The literal return type is what expo-router's typed routes accept; a plain
	// `string` is rejected at the call site.
	return role === "organizer"
		? `/manage/${listingId}`
		: `/listing/${listingId}`;
}

/** What happened. Anything unrecognised is rendered as "activity". */
export type NotificationKind = "claim" | "pickup" | "rating" | "activity";

export interface AppNotification {
	id: string;
	message: string;
	/** Server-recorded, never inferred from the message text. */
	kind: NotificationKind;
	listing_id: string | null;
	/** Null once the listing is deleted, or when the post had no photo. */
	listing_title: string | null;
	listing_photo_url: string | null;
	read: boolean;
	created_at: string;
}

export interface NotificationList {
	items: AppNotification[];
	unread_count: number;
}

export async function fetchNotifications(): Promise<NotificationList> {
	return api.get<NotificationList>("/notifications");
}

export async function markNotificationsRead(): Promise<void> {
	await api.post<void>("/notifications/read");
}

/** Remove one notification. 404s if it's already gone or isn't yours. */
export async function deleteNotification(id: string): Promise<void> {
	await api.del<void>(`/notifications/${id}`);
}
