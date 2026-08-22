/** In-app notifications client — mirrors the backend notification schema. */

import { api } from "@/lib/api";

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
