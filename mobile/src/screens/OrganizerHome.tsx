import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Image, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { FadeInItem } from "@/components/ui/FadeInItem";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { PressableScale } from "@/components/ui/PressableScale";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { theme } from "@/hooks/useThemeColors";
import { formatLocation } from "@/lib/format";
import { subscribeToListings } from "@/lib/listingStream";
import {
	fetchImpact,
	fetchMyListings,
	type HostImpact,
	type Listing,
	publishListing,
} from "@/lib/listings";

type Tab = "active" | "scheduled" | "past";

const TABS: { key: Tab; label: string }[] = [
	{ key: "active", label: "Active" },
	{ key: "scheduled", label: "Scheduled" },
	{ key: "past", label: "Past" },
];

function Stat({ n, label }: { n: number; label: string }) {
	return (
		<View className="items-center flex-1">
			<AnimatedNumber
				value={n}
				className="font-display-bold text-2xl text-white"
			/>
			<Text className="font-body text-forest-100 text-xs mt-0.5 text-center">
				{label}
			</Text>
		</View>
	);
}

export function OrganizerHome() {
	const router = useRouter();
	const { profile } = useAuth();
	const [listings, setListings] = useState<Listing[]>([]);
	const [impact, setImpact] = useState<HostImpact | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [tab, setTab] = useState<Tab>("active");
	const [publishing, setPublishing] = useState<string | null>(null);

	async function onPublish(id: string) {
		setPublishing(id);
		try {
			await publishListing(id);
			await load();
		} finally {
			setPublishing(null);
		}
	}

	const load = useCallback(async () => {
		try {
			setError(false);
			const [posts, stats] = await Promise.all([
				fetchMyListings(),
				fetchImpact(),
			]);
			setListings(posts);
			setImpact(stats);
		} catch {
			// Don't let a transient failure (e.g. a lapsed session) throw as an
			// uncaught error and drop the whole app into the red overlay. Show a
			// quiet retry instead.
			setError(true);
		} finally {
			setLoading(false);
		}
	}, []);

	// Reload whenever the dashboard regains focus, so a post created or published
	// on another screen shows up on return without a manual refresh.
	useFocusEffect(
		useCallback(() => {
			void load();
		}, [load]),
	);

	// Live updates over SSE, the same stream the recipient feed uses.
	//
	// Focus alone was not enough: a host watching their own post while someone
	// claimed it saw the count sit still until they navigated away and back.
	// They are the person who most needs "3 portions left" to be true at a
	// glance — they get a push about the claim, so the stale number beside it
	// read as a bug.
	const listingsRef = useRef(listings);
	listingsRef.current = listings;

	useEffect(() => {
		let close = () => {};
		let cancelled = false;

		void subscribeToListings((event) => {
			// The stream carries every host's listings. The recipient feed
			// refetches on an unfamiliar id because a stranger's new post may
			// belong in it; this dashboard only ever shows our own, so anything
			// we don't already hold belongs to someone else and refetching on it
			// would fire constantly for nothing.
			if (!listingsRef.current.some((l) => l.id === event.listing_id)) return;

			// Patch in place rather than dropping the row: the tabs are derived
			// from `status`, so a cancelled or claimed-out post moves itself from
			// Active to Past without anything here knowing which tab is showing.
			setListings((prev) =>
				prev.map((l) =>
					l.id === event.listing_id
						? {
								...l,
								quantity_remaining: event.quantity_remaining,
								status: event.status as Listing["status"],
							}
						: l,
				),
			);
		}).then((fn) => {
			if (cancelled) fn();
			else close = fn;
		});

		return () => {
			cancelled = true;
			close();
		};
	}, []);

	if (loading) {
		return (
			<SafeAreaView className="flex-1 bg-page" edges={["top"]}>
				<View className="px-5 pt-2 pb-3">
					<Text className="font-display-bold text-3xl text-brand">
						Host Dashboard
					</Text>
				</View>
				<SkeletonList count={4} variant="row" />
			</SafeAreaView>
		);
	}

	if (error) {
		return (
			<SafeAreaView
				className="flex-1 bg-page items-center justify-center px-8"
				edges={["top"]}
			>
				<Text className="font-display-bold text-lg text-gray-900 text-center">
					Couldn't load your dashboard
				</Text>
				<Text className="font-body text-gray-500 text-center mt-2 mb-5">
					Check your connection and try again.
				</Text>
				<Button onPress={() => void load()}>Retry</Button>
			</SafeAreaView>
		);
	}

	const firstName = profile?.name?.split(" ")[0] ?? "Sun Devil";

	const inTab = (l: Listing): boolean => {
		if (tab === "active") return l.status === "active";
		if (tab === "scheduled")
			return l.status === "draft" || l.status === "scheduled";
		return ["claimed", "expired", "cancelled"].includes(l.status);
	};

	const visible = listings.filter(inTab);

	return (
		<SafeAreaView className="flex-1 bg-page" edges={["top"]}>
			{/* Header */}
			<View className="px-5 pt-2 pb-3 flex-row items-start justify-between">
				<View>
					<Text className="font-display-bold text-3xl text-brand">
						Host Dashboard
					</Text>
					<Text className="font-body text-gray-500 mt-0.5">
						Good to share, {firstName}.
					</Text>
				</View>
				<NotificationBell />
			</View>

			{/* Impact card */}
			<View className="mx-5 bg-forest-800 rounded-card p-4 mb-4">
				<Text className="font-body-medium text-forest-100 text-xs uppercase tracking-wide mb-3">
					Impact So Far
				</Text>
				<View className="flex-row justify-between">
					<Stat n={impact?.meals_shared ?? 0} label="Meals Shared" />
					<Stat n={impact?.people_fed ?? 0} label="People Fed" />
					<Stat n={impact?.active_posts ?? 0} label="Active Posts" />
				</View>

				{/* Pounds diverted is the unit food-recovery reporting speaks in, so
				    it earns a place here — but it is derived from portions, not
				    weighed. It sits as a footer line rather than a fourth Stat both
				    because four tiles crowd a phone and because "est." needs to be
				    read in the same breath as the number, which a tile label can't
				    do. Hidden until there is something to report, so a new host
				    isn't greeted by "≈0.0 lbs". */}
				{(impact?.pounds_saved ?? 0) > 0 && (
					<Text className="font-body text-forest-100 text-xs mt-3 pt-3 border-t border-forest-700">
						≈ {impact?.pounds_saved.toFixed(1)} lbs kept out of a landfill
						<Text className="text-forest-300">
							{" "}
							· est. from portions shared
						</Text>
					</Text>
				)}
			</View>

			{/* Tabs */}
			<View className="px-5 pb-3 flex-row gap-2">
				{TABS.map(({ key, label }) => {
					const on = tab === key;
					return (
						<Pressable
							key={key}
							onPress={() => setTab(key)}
							className={`rounded-full px-4 py-2 border ${on ? "bg-forest-800 border-forest-800" : "bg-card border-gray-200"}`}
						>
							<Text
								className={`font-body-medium text-sm ${on ? "text-white" : "text-gray-600"}`}
							>
								{label}
							</Text>
						</Pressable>
					);
				})}
			</View>

			<FlatList
				data={visible}
				keyExtractor={(item) => item.id}
				contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
				showsVerticalScrollIndicator={false}
				renderItem={({ item, index }) => {
					const cover = item.photo_urls[0];
					const live = item.status === "active";
					const prelive =
						item.status === "draft" || item.status === "scheduled";
					return (
						<FadeInItem index={index}>
							<PressableScale
								onPress={() => router.push(`/manage/${item.id}`)}
								className="bg-card rounded-card p-4 border border-gray-100"
								accessibilityRole="button"
								accessibilityLabel={`Manage ${item.title}`}
							>
								<View className="flex-row gap-3 items-center">
									{cover ? (
										<Image
											source={{ uri: cover }}
											className="w-16 h-16 rounded-xl bg-gray-100"
										/>
									) : (
										<View className="w-16 h-16 rounded-xl bg-forest-50 items-center justify-center">
											<Ionicons
												name="fast-food-outline"
												size={22}
												color="#A8CFBD"
											/>
										</View>
									)}
									<View className="flex-1">
										<Text
											className="font-display-bold text-base text-gray-900"
											numberOfLines={1}
										>
											{item.title}
										</Text>
										<Text
											className="font-body text-gray-500 text-sm"
											numberOfLines={1}
										>
											{formatLocation(item.building, item.room)}
										</Text>
										<View className="flex-row items-center gap-2 mt-1">
											{live && (
												<View className="flex-row items-center gap-1">
													<View className="w-2 h-2 rounded-full bg-lime" />
													<Text className="font-body-medium text-brand text-xs">
														Live
													</Text>
												</View>
											)}
											{item.status === "draft" && (
												<Text className="font-body-medium text-gray-500 text-xs">
													Draft
												</Text>
											)}
											{item.status === "scheduled" && item.scheduled_for && (
												<Text className="font-body-medium text-brand text-xs">
													Scheduled ·{" "}
													{new Date(item.scheduled_for).toLocaleString([], {
														month: "short",
														day: "numeric",
														hour: "numeric",
														minute: "2-digit",
													})}
												</Text>
											)}
											<Text className="font-body text-gray-500 text-xs">
												{live ? (
													<>
														<Text className="font-body-semibold text-gray-900">
															{item.quantity_remaining} left
														</Text>{" "}
														of {item.quantity_total} servings
													</>
												) : (
													`${item.quantity_total} servings`
												)}
											</Text>
										</View>
									</View>
									<Ionicons
										name="chevron-forward"
										size={18}
										color={theme.muted}
									/>
								</View>
							</PressableScale>
							{prelive && (
								<View className="mt-2">
									<Button
										size="sm"
										loading={publishing === item.id}
										onPress={() => onPublish(item.id)}
									>
										Publish now
									</Button>
								</View>
							)}
						</FadeInItem>
					);
				}}
				ListFooterComponent={
					<View className="mt-2">
						<Button
							variant="outline"
							size="lg"
							onPress={() => router.push("/post")}
						>
							+ Create New Post
						</Button>
					</View>
				}
				ListEmptyComponent={
					<View className="items-center justify-center px-8 pt-12">
						<Text className="font-display-bold text-lg text-gray-900 text-center">
							{tab === "active"
								? "No active posts"
								: tab === "scheduled"
									? "No scheduled posts"
									: "Nothing here yet"}
						</Text>
						<Text className="font-body text-gray-500 text-center mt-2">
							{tab === "scheduled"
								? "Drafts and scheduled posts appear here."
								: "Share surplus food and students nearby will see it right away."}
						</Text>
					</View>
				}
			/>
		</SafeAreaView>
	);
}
