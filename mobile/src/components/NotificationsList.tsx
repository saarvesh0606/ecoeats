import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { EmptyBell } from "@/components/ui/EmptyBell";
import { Spinner } from "@/components/ui/Spinner";
import { SwipeableRow } from "@/components/ui/SwipeableRow";
import { useToast } from "@/components/ui/Toast";
import {
	type AppNotification,
	deleteNotification,
	fetchNotifications,
	markNotificationsRead,
} from "@/lib/notifications";

function timeAgo(iso: string): string {
	const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
	if (s < 60) return "just now";
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

/** The notifications feed body, shared by the bell screen and the Activity tab.
 *  Fetches on mount and marks everything read once opened. */
export function NotificationsList() {
	const router = useRouter();
	const toast = useToast();
	const [items, setItems] = useState<AppNotification[]>([]);
	const [loading, setLoading] = useState(true);

	async function onDelete(target: AppNotification) {
		// Drop it straight away — waiting on the round trip makes the tap feel
		// broken. Put it back if the server disagrees.
		setItems((prev) => prev.filter((n) => n.id !== target.id));
		try {
			await deleteNotification(target.id);
		} catch {
			setItems((prev) =>
				[...prev, target].sort((a, b) =>
					b.created_at.localeCompare(a.created_at),
				),
			);
			toast.show("Couldn't delete that. Try again.");
		}
	}

	const load = useCallback(async () => {
		try {
			const list = await fetchNotifications();
			setItems(list.items);
			if (list.unread_count > 0) await markNotificationsRead();
		} catch {
			// A transient failure just leaves the list as-is.
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	if (loading) return <Spinner className="flex-1 bg-cream" />;

	return (
		<FlatList
			data={items}
			keyExtractor={(n) => n.id}
			contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
			showsVerticalScrollIndicator={false}
			renderItem={({ item }) => {
				const body = (
					<View
						className={`rounded-card p-4 border ${item.read ? "bg-white border-gray-100" : "bg-forest-50 border-forest-100"}`}
					>
						<View className="flex-row items-start gap-3">
							<View className="w-9 h-9 rounded-full bg-forest-100 items-center justify-center">
								<Ionicons
									name="notifications-outline"
									size={16}
									color="#1B4332"
								/>
							</View>
							<View className="flex-1">
								<Text className="font-body text-gray-900">{item.message}</Text>
								<Text className="font-body text-gray-400 text-xs mt-1">
									{timeAgo(item.created_at)}
								</Text>
							</View>
						</View>
					</View>
				);
				return (
					<SwipeableRow onDelete={() => void onDelete(item)}>
						{item.listing_id ? (
							<Pressable
								onPress={() => router.push(`/listing/${item.listing_id}`)}
								accessibilityRole="button"
								accessibilityLabel={item.message}
							>
								{body}
							</Pressable>
						) : (
							body
						)}
					</SwipeableRow>
				);
			}}
			ListEmptyComponent={
				<View className="items-center justify-center px-8 pt-24">
					<EmptyBell />
					<Text className="font-display-bold text-lg text-gray-900 text-center mt-4">
						You're all caught up
					</Text>
					<Text className="font-body text-gray-500 text-center mt-1">
						Claims, pickups and ratings will show up here.
					</Text>
				</View>
			}
		/>
	);
}
