import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, SectionList, Text, View } from "react-native";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EmptyBell } from "@/components/ui/EmptyBell";
import { Spinner } from "@/components/ui/Spinner";
import { SwipeableRow } from "@/components/ui/SwipeableRow";
import { useToast } from "@/components/ui/Toast";
import { haptics } from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { useUnread } from "@/context/UnreadContext";
import {
	type AppNotification,
	clearNotifications,
	deleteNotification,
	fetchNotifications,
	listingRouteFor,
	markNotificationsRead,
	type NotificationKind,
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

/**
 * How each kind of event presents itself.
 *
 * Every row used to carry the same grey bell, so a claim, a pickup and a
 * rating were indistinguishable until you read the sentence. Giving each its
 * own mark is what makes the list scannable rather than merely readable.
 */
const APPEARANCE: Record<
	NotificationKind,
	{ icon: keyof typeof Ionicons.glyphMap; tint: string; bubble: string }
> = {
	claim: { icon: "basket-outline", tint: "#0C3226", bubble: "bg-forest-100" },
	pickup: {
		icon: "checkmark-circle-outline",
		tint: "#2D6A4F",
		bubble: "bg-[#DCF4E7]",
	},
	rating: { icon: "star", tint: "#B08D3F", bubble: "bg-[#FFF3D6]" },
	activity: {
		icon: "notifications-outline",
		tint: "#414845",
		bubble: "bg-surface-high",
	},
};

/** Unrecognised kinds render as plain activity rather than crashing. */
function appearanceFor(kind: string) {
	return APPEARANCE[kind as NotificationKind] ?? APPEARANCE.activity;
}

type Bucket = "Today" | "Yesterday" | "Earlier";
const BUCKET_ORDER: Bucket[] = ["Today", "Yesterday", "Earlier"];

function bucketFor(iso: string, now = new Date()): Bucket {
	const startOfToday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
	).getTime();
	const at = new Date(iso).getTime();
	if (at >= startOfToday) return "Today";
	if (at >= startOfToday - 86_400_000) return "Yesterday";
	return "Earlier";
}

/**
 * Split into day sections, preserving the server's newest-first order.
 *
 * Relative stamps alone ("2h ago", "3d ago") give no sense of where one day
 * ends and the next begins, which is the thing you actually scan for when
 * catching up.
 */
function groupByDay(items: AppNotification[]) {
	const buckets = new Map<Bucket, AppNotification[]>();
	for (const item of items) {
		const key = bucketFor(item.created_at);
		const existing = buckets.get(key);
		if (existing) existing.push(item);
		else buckets.set(key, [item]);
	}
	return BUCKET_ORDER.filter((key) => buckets.has(key)).map((key) => ({
		title: key,
		data: buckets.get(key) as AppNotification[],
	}));
}

/** The notifications feed body, shared by the bell screen and the Activity tab.
 *  Fetches on mount and marks everything read once opened. */
export function NotificationsList() {
	const router = useRouter();
	const toast = useToast();
	// A host and a recipient get sent to different screens for the same post.
	const { profile } = useAuth();
	const { clear: clearUnread, drop: dropUnread } = useUnread();
	const confirm = useConfirm();
	const [items, setItems] = useState<AppNotification[]>([]);
	const [loading, setLoading] = useState(true);

	async function onDelete(target: AppNotification) {
		// Deleting an unread row is another way of dealing with it — the dot
		// must not outlive the thing it was pointing at.
		if (!target.read) dropUnread();
		// Drop it straight away — waiting on the round trip makes the tap feel
		// broken. Put it back if the server disagrees.
		setItems((prev) => prev.filter((n) => n.id !== target.id));
		haptics.press();
		try {
			await deleteNotification(target.id);
		} catch {
			setItems((prev) =>
				[...prev, target].sort((a, b) =>
					b.created_at.localeCompare(a.created_at),
				),
			);
			haptics.error();
			toast.show("Couldn't delete that. Try again.");
		}
	}

	async function onClearAll() {
		// Confirmed, unlike deleting one row. A single swipe takes back one thing
		// and the row is still in hand to re-read; this takes the lot, there is no
		// undo, and it sits one tap from where people are reading.
		const ok = await confirm({
			title: "Clear all notifications?",
			message: "This removes everything here. It cannot be undone.",
			confirmLabel: "Clear everything",
			cancelLabel: "Keep them",
		});
		if (!ok) return;

		const previous = items;
		// Emptied straight away, like a single delete, and put back if the server
		// disagrees — the round trip is long enough that waiting reads as a dead
		// button.
		setItems([]);
		clearUnread();
		haptics.press();
		try {
			await clearNotifications();
		} catch {
			setItems(previous);
			haptics.error();
			toast.show("Couldn't clear those. Try again.");
		}
	}

	const load = useCallback(async () => {
		try {
			const list = await fetchNotifications();
			setItems(list.items);
			if (list.unread_count > 0) {
				await markNotificationsRead();
				// Opening this screen is what "seen" means, so the dot goes now
				// rather than waiting for the next count refresh.
				clearUnread();
			}
		} catch {
			// A transient failure just leaves the list as-is.
		} finally {
			setLoading(false);
		}
	}, [clearUnread]);

	useEffect(() => {
		void load();
	}, [load]);

	if (loading) return <Spinner className="flex-1 bg-cream" />;

	return (
		<SectionList
			sections={groupByDay(items)}
			keyExtractor={(n) => n.id}
			contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
			showsVerticalScrollIndicator={false}
			stickySectionHeadersEnabled={false}
			// Only offered when there is something to clear: a button that empties
			// an empty list is noise on the one screen that should feel calm.
			ListHeaderComponent={
				items.length > 0 ? (
					<View className="flex-row justify-end">
						<Pressable
							onPress={() => void onClearAll()}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel="Clear all notifications"
						>
							<Text className="font-body-semibold text-sm text-forest-700">
								Clear all
							</Text>
						</Pressable>
					</View>
				) : null
			}
			renderSectionHeader={({ section }) => (
				<Text className="font-body-semibold text-ink-muted text-xs uppercase tracking-wide mt-4 mb-2">
					{section.title}
				</Text>
			)}
			SectionSeparatorComponent={null}
			ItemSeparatorComponent={() => <View className="h-2.5" />}
			renderItem={({ item }) => {
				const look = appearanceFor(item.kind);
				const body = (
					<View
						className={`rounded-card p-4 border ${
							item.read
								? "bg-white border-gray-100"
								: "bg-forest-50 border-forest-100 border-l-4 border-l-forest-600"
						}`}
					>
						<View className="flex-row items-start gap-3">
							<View
								className={`w-9 h-9 rounded-full items-center justify-center ${look.bubble}`}
							>
								<Ionicons name={look.icon} size={16} color={look.tint} />
							</View>

							<View className="flex-1">
								<Text
									className={`text-ink ${item.read ? "font-body" : "font-body-semibold"}`}
								>
									{item.message}
								</Text>
								{item.listing_title && (
									<Text
										className="font-body text-ink-muted text-xs mt-0.5"
										numberOfLines={1}
									>
										{item.listing_title}
									</Text>
								)}
								<View className="flex-row items-center gap-1.5 mt-1">
									{!item.read && (
										<View className="w-1.5 h-1.5 rounded-full bg-forest-600" />
									)}
									<Text className="font-body text-gray-400 text-xs">
										{timeAgo(item.created_at)}
									</Text>
								</View>
							</View>

							{/* The food itself, when the post had a photo and still exists. */}
							{item.listing_photo_url && (
								<Image
									source={{ uri: item.listing_photo_url }}
									className="w-11 h-11 rounded-btn bg-surface-high"
								/>
							)}
						</View>
					</View>
				);
				// Held in a const so the null check still applies inside the
				// callback, where narrowing on the item itself doesn't reach.
				const listingId = item.listing_id;
				return (
					<SwipeableRow onDelete={() => void onDelete(item)}>
						{listingId ? (
							<Pressable
								onPress={() =>
									router.push(listingRouteFor(profile?.role, listingId))
								}
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
