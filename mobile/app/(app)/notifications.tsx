import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Spinner } from "@/components/ui/Spinner";
import {
	type AppNotification,
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

export default function NotificationsScreen() {
	const router = useRouter();
	const [items, setItems] = useState<AppNotification[]>([]);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		try {
			const list = await fetchNotifications();
			setItems(list.items);
			// Opening the screen counts as reading them.
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
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<View className="px-5 pt-2 pb-3 flex-row items-center gap-2">
				<Pressable
					onPress={() => router.back()}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Back"
				>
					<Ionicons name="chevron-back" size={24} color="#163827" />
				</Pressable>
				<Text className="font-display-bold text-2xl text-forest-800">
					Notifications
				</Text>
			</View>

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
					return item.listing_id ? (
						<Pressable
							onPress={() => router.push(`/listing/${item.listing_id}`)}
							accessibilityRole="button"
							accessibilityLabel={item.message}
						>
							{body}
						</Pressable>
					) : (
						body
					);
				}}
				ListEmptyComponent={
					<View className="items-center justify-center px-8 pt-24">
						<Ionicons
							name="notifications-off-outline"
							size={40}
							color="#9CA3AF"
						/>
						<Text className="font-display-bold text-lg text-gray-900 text-center mt-3">
							You're all caught up
						</Text>
						<Text className="font-body text-gray-500 text-center mt-1">
							Claims, pickups and ratings will show up here.
						</Text>
					</View>
				}
			/>
		</SafeAreaView>
	);
}
