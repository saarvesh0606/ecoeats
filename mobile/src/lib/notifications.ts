/** In-app notifications client — mirrors the backend notification schema. */

import { api } from "@/lib/api";

export interface AppNotification {
	id: string;
	message: string;
	listing_id: string | null;
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
