import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { type ConfirmSpec, useConfirm } from "@/components/ui/ConfirmDialog";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useNow } from "@/hooks/useNow";
import { ApiError } from "@/lib/api";
import {
	type Claim,
	confirmPickup,
	fetchListingClaims,
	markNoShow,
} from "@/lib/claims";
import { formatLocation, formatTimeLeft } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import {
	cancelListing,
	fetchListing,
	type Listing,
	setListingStatus,
} from "@/lib/listings";

const STATUS_LABEL: Record<Claim["status"], string> = {
	pending: "Waiting",
	picked_up: "Picked up",
	no_show: "No-show",
	cancelled: "Cancelled",
};

const STATUS_STYLE: Record<Claim["status"], string> = {
	pending: "bg-forest-100 text-forest-700",
	picked_up: "bg-forest-700 text-white",
	no_show: "bg-red-100 text-red-700",
	cancelled: "bg-gray-100 text-gray-500",
};

function timeAgo(iso: string, now: number): string {
	const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m} min ago`;
	return `${Math.floor(m / 60)}h ago`;
}

export default function ManageListing() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const now = useNow();
	const toast = useToast();
	const confirm = useConfirm();

	const [listing, setListing] = useState<Listing | null>(null);
	const [claims, setClaims] = useState<Claim[]>([]);
	const [loading, setLoading] = useState(true);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!id) return;
		try {
			const [l, c] = await Promise.all([
				fetchListing(id),
				fetchListingClaims(id),
			]);
			setListing(l);
			setClaims(c);
		} catch (err) {
			setError(
				err instanceof ApiError ? err.message : "Couldn't load this post.",
			);
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		void load();
	}, [load]);

	async function act(
		key: string,
		fn: () => Promise<unknown>,
		opts: { confirm?: ConfirmSpec; success?: string } = {},
	) {
		if (opts.confirm && !(await confirm(opts.confirm))) return;
		setBusyId(key);
		setError(null);
		try {
			await fn();
			await load();
			haptics.success();
			if (opts.success) toast.show(opts.success);
		} catch (err) {
			haptics.error();
			setError(err instanceof ApiError ? err.message : "Something went wrong.");
		} finally {
			setBusyId(null);
		}
	}

	async function endPostEarly() {
		const ok = await confirm({
			title: "End this post early?",
			message:
				"It disappears for everyone immediately. Anyone who already claimed a portion keeps it.",
			confirmLabel: "End post",
		});
		if (!ok) return;
		setBusyId("cancel");
		setError(null);
		try {
			await cancelListing(listing?.id ?? "");
			haptics.success();
			toast.show("Post ended.");
			// Land back on the dashboard so the change is visible where it matters.
			router.replace("/posts");
		} catch (err) {
			haptics.error();
			setError(err instanceof ApiError ? err.message : "Something went wrong.");
			setBusyId(null);
		}
	}

	if (loading) return <Spinner className="flex-1 bg-cream" />;

	if (!listing) {
		return (
			<SafeAreaView className="flex-1 bg-cream items-center justify-center px-8">
				<Text className="font-body text-gray-600 text-center mb-4">
					{error ?? "Post not found."}
				</Text>
				<Button variant="outline" onPress={() => router.replace("/posts")}>
					Back to your posts
				</Button>
			</SafeAreaView>
		);
	}

	const live = listing.status === "active";
	const isOpen = live || listing.status === "claimed";
	const claimed = listing.quantity_total - listing.quantity_remaining;
	const pct =
		listing.quantity_total > 0
			? Math.round((claimed / listing.quantity_total) * 100)
			: 0;
	const cover = listing.photo_urls[0];

	const header = (
		<View>
			{/* Post summary */}
			<View className="bg-white rounded-card p-4 border border-gray-100 flex-row gap-3 items-center">
				{cover ? (
					<Image
						source={{ uri: cover }}
						className="w-14 h-14 rounded-xl bg-gray-100"
					/>
				) : (
					<View className="w-14 h-14 rounded-xl bg-forest-50 items-center justify-center">
						<Ionicons name="fast-food-outline" size={20} color="#86d6ad" />
					</View>
				)}
				<View className="flex-1">
					<Text
						className="font-display-bold text-base text-gray-900"
						numberOfLines={1}
					>
						{listing.title}
					</Text>
					<Text className="font-body text-gray-500 text-sm" numberOfLines={1}>
						{formatLocation(listing.building, listing.room)}
					</Text>
					<View className="flex-row items-center gap-1 mt-1">
						{live && <View className="w-2 h-2 rounded-full bg-lime" />}
						<Text className="font-body-medium text-forest-600 text-xs capitalize">
							{live ? "Live" : listing.status}
							{live ? ` · ${formatTimeLeft(listing.expires_at, now)}` : ""}
						</Text>
					</View>
				</View>
			</View>

			{/* Quantity left */}
			<View className="bg-white rounded-card p-4 border border-gray-100 mt-3">
				<Text className="font-body-semibold text-gray-900">Quantity Left</Text>
				<View className="flex-row items-baseline gap-1 mt-1">
					<Text className="font-display-bold text-3xl text-forest-800">
						{listing.quantity_remaining}
					</Text>
					<Text className="font-body text-gray-500">
						of {listing.quantity_total} servings
					</Text>
				</View>
				<View className="mt-2">
					<ProgressBar percent={pct} />
				</View>
				<Text className="font-body text-gray-400 text-xs mt-2">
					{claimed} claimed · {listing.interested_count}{" "}
					{listing.interested_count === 1 ? "person" : "people"} interested
				</Text>
			</View>

			{/* Actions. Stacked and full-width rather than side by side: these are
			    distinct decisions, and a cramped row makes the destructive one easy
			    to hit by accident. */}
			{isOpen && (
				<View className="mt-5">
					<Text className="font-display-bold text-lg text-gray-900 mb-2">
						Actions
					</Text>
					<View className="gap-2">
						<Button
							variant="outline"
							loading={busyId === "stock"}
							onPress={() =>
								act(
									"stock",
									() =>
										setListingStatus(listing.id, live ? "claimed" : "active"),
									{ success: live ? "Marked out of stock." : "Post reopened." },
								)
							}
						>
							{live ? "Out of Stock" : "Reopen"}
						</Button>
						<Button
							variant="danger"
							loading={busyId === "cancel"}
							onPress={endPostEarly}
						>
							End Post Early
						</Button>
					</View>
				</View>
			)}

			<Text className="font-display-bold text-lg text-gray-900 mt-5 mb-1">
				Live Activity
			</Text>
		</View>
	);

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<View className="px-5 pt-2 pb-3 flex-row items-center gap-2">
				<Pressable
					onPress={() => router.replace("/posts")}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Back to your posts"
				>
					<Ionicons name="chevron-back" size={24} color="#163827" />
				</Pressable>
				<Text className="font-display-bold text-2xl text-forest-800">
					Post Management
				</Text>
			</View>

			{error && (
				<Text className="font-body text-red-500 text-sm px-5 pb-2">
					{error}
				</Text>
			)}

			<FlatList
				data={claims}
				keyExtractor={(item) => item.id}
				contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
				showsVerticalScrollIndicator={false}
				ListHeaderComponent={header}
				renderItem={({ item }) => (
					<View className="bg-white rounded-card p-4 border border-gray-100">
						<View className="flex-row items-center gap-3">
							<Avatar name={item.recipient_name} />
							<View className="flex-1">
								<Text className="font-body-semibold text-gray-900">
									{item.recipient_name}
								</Text>
								<Text className="font-body text-gray-500 text-xs">
									Claimed {item.quantity} serving{item.quantity > 1 ? "s" : ""}{" "}
									· {timeAgo(item.claimed_at, now)}
								</Text>
							</View>
							<View
								className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[item.status].split(" ")[0]}`}
							>
								<Text
									className={`font-body-semibold text-xs ${STATUS_STYLE[item.status].split(" ").slice(1).join(" ")}`}
								>
									{STATUS_LABEL[item.status]}
								</Text>
							</View>
						</View>

						{item.status === "pending" && (
							<View className="flex-row gap-3 mt-3">
								<View className="flex-1">
									<Button
										size="sm"
										loading={busyId === `pickup-${item.id}`}
										onPress={() =>
											act(`pickup-${item.id}`, () => confirmPickup(item.id), {
												success: "Pickup confirmed.",
											})
										}
									>
										Confirm pickup
									</Button>
								</View>
								<View className="flex-1">
									<Button
										size="sm"
										variant="outline"
										loading={busyId === `noshow-${item.id}`}
										onPress={() =>
											act(`noshow-${item.id}`, () => markNoShow(item.id), {
												confirm: {
													title: "Mark as no-show?",
													message: `${item.recipient_name} didn't collect. Their portion goes back into the pool for someone else.`,
													confirmLabel: "Mark no-show",
												},
												success: "Marked as no-show.",
											})
										}
									>
										No-show
									</Button>
								</View>
							</View>
						)}
					</View>
				)}
				ListEmptyComponent={
					<View className="items-center justify-center px-8 pt-8">
						<Text className="font-body text-gray-500 text-center">
							No claims yet. When someone reserves a portion, they'll appear
							here so you can confirm the handoff.
						</Text>
					</View>
				}
			/>
		</SafeAreaView>
	);
}
