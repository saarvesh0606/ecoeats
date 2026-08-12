import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FeedFilterSheet } from "@/components/FeedFilterSheet";
import { ListingCard } from "@/components/ListingCard";
import { Button } from "@/components/ui/Button";
import { FadeInItem } from "@/components/ui/FadeInItem";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useDeviceLocation } from "@/hooks/useDeviceLocation";
import { useNow } from "@/hooks/useNow";
import { ApiError } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { DIETARY_TAGS, fetchFeed, type Listing } from "@/lib/listings";
import { subscribeToListings } from "@/lib/listingStream";

// "Expiring soon" — surfaces food about to be wasted, the whole point.
const SOON_MINUTES = 20;

export function RecipientFeed() {
	const router = useRouter();
	const now = useNow();

	const [listings, setListings] = useState<Listing[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const [dietary, setDietary] = useState<string[]>([]);
	// Undefined means no limit. The chip flips it to SOON_MINUTES and back; the
	// filter sheet can set any window the server supports. One piece of state
	// either way, so the two controls can never disagree.
	const [maxMinutes, setMaxMinutes] = useState<number | undefined>(undefined);
	const [radiusMiles, setRadiusMiles] = useState<number | undefined>(undefined);
	const [filtersOpen, setFiltersOpen] = useState(false);
	// Server-side search: `query` is what the user is typing, `debouncedQuery` is
	// what we actually send — so we re-fetch after they pause, not per keystroke.
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");

	useEffect(() => {
		const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
		return () => clearTimeout(t);
	}, [query]);

	// Asked for on arrival, because "what's near me" is the whole screen. The
	// feed does not wait for it: the first page loads without coordinates and
	// re-fetches once a fix arrives, so a slow or refused permission costs a
	// distance label, never the food itself.
	const { coords } = useDeviceLocation({ auto: true });

	const filters = useCallback(
		() => ({
			dietary: dietary.length ? dietary : undefined,
			maxMinutes,
			// The server rejects a radius outright when it has no origin to measure
			// from, so it is dropped whenever there is no fix — including the case
			// where permission is revoked after a distance was already chosen.
			radiusMiles: coords ? radiusMiles : undefined,
			q: debouncedQuery || undefined,
			lat: coords?.lat,
			lng: coords?.lng,
		}),
		[dietary, maxMinutes, radiusMiles, debouncedQuery, coords],
	);

	const load = useCallback(async () => {
		try {
			setError(null);
			const page = await fetchFeed(filters());
			setListings(page.items);
			setNextCursor(page.nextCursor);
		} catch (err) {
			setError(
				err instanceof ApiError ? err.message : "Couldn't load food nearby.",
			);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, [filters]);

	const loadMore = useCallback(async () => {
		if (!nextCursor || loadingMore) return;
		setLoadingMore(true);
		try {
			const page = await fetchFeed(filters(), nextCursor);
			// Dedupe by id: a listing could have arrived over SSE since page one.
			setListings((prev) => {
				const seen = new Set(prev.map((l) => l.id));
				return [...prev, ...page.items.filter((l) => !seen.has(l.id))];
			});
			setNextCursor(page.nextCursor);
		} catch {
			// A failed "load more" leaves the list intact; scrolling again or a
			// pull-to-refresh retries.
		} finally {
			setLoadingMore(false);
		}
	}, [nextCursor, loadingMore, filters]);

	useEffect(() => {
		void load();
	}, [load]);

	// Live updates over SSE, replacing polling. Refs let the mount-only
	// subscription always see the current listings and the latest `load`
	// (which closes over the active filters) without reconnecting on every
	// filter change.
	const listingsRef = useRef(listings);
	listingsRef.current = listings;
	const loadRef = useRef(load);
	loadRef.current = load;

	useEffect(() => {
		let close = () => {};
		let cancelled = false;

		void subscribeToListings((event) => {
			const known = listingsRef.current.some((l) => l.id === event.listing_id);
			// A change to a listing we don't have is almost always a new post;
			// refetch so server-side filters decide whether it belongs here.
			if (!known) {
				void loadRef.current();
				return;
			}
			const available =
				event.status === "active" && event.quantity_remaining > 0;
			setListings((prev) =>
				available
					? prev.map((l) =>
							l.id === event.listing_id
								? {
										...l,
										quantity_remaining: event.quantity_remaining,
										status: event.status as Listing["status"],
									}
								: l,
						)
					: prev.filter((l) => l.id !== event.listing_id),
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

	function toggleDietary(tag: string) {
		setDietary((prev) =>
			prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
		);
	}

	const clearFilters = useCallback(() => {
		setDietary([]);
		setMaxMinutes(undefined);
		setRadiusMiles(undefined);
	}, []);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		// Fires when the pull actually triggers, which is the moment the gesture
		// is committed and the one the user is pulling to find.
		haptics.tap();
		void load();
	}, [load]);

	if (loading) {
		return (
			<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
				<View className="px-5 pt-2 pb-3">
					<Text className="font-display-bold text-3xl text-forest-800">
						Discover
					</Text>
					<Text className="font-body text-gray-500 mt-0.5">
						Good food. Good impact.
					</Text>
				</View>
				<SkeletonList count={3} />
			</SafeAreaView>
		);
	}

	// Counts what is actually being sent, so the badge can't advertise a distance
	// filter that the missing-coordinates guard above is quietly dropping.
	const activeCount =
		dietary.length +
		(maxMinutes !== undefined ? 1 : 0) +
		(coords && radiusMiles !== undefined ? 1 : 0);
	const filtersActive = activeCount > 0;
	const searching = debouncedQuery.length > 0;
	const chips = ["all", "soon", ...DIETARY_TAGS];

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			{/* Header */}
			<View className="px-5 pt-2 pb-3 flex-row items-start justify-between">
				<View>
					<Text className="font-display-bold text-3xl text-forest-800">
						Discover
					</Text>
					<Text className="font-body text-gray-500 mt-0.5">
						Good food. Good impact.
					</Text>
				</View>
				<Pressable
					hitSlop={8}
					className="mt-1"
					onPress={() => router.push("/notifications")}
					accessibilityRole="button"
					accessibilityLabel="Notifications"
				>
					<Ionicons name="notifications-outline" size={24} color="#0C3226" />
				</Pressable>
			</View>

			{/* Search */}
			<View className="px-5 pb-3">
				<View className="flex-row items-center bg-white border border-gray-200 rounded-full px-4 py-2.5">
					<Ionicons name="search" size={18} color="#9CA3AF" />
					<TextInput
						className="flex-1 font-body text-base text-gray-900 ml-2"
						placeholder="Search food, meals, or locations"
						placeholderTextColor="#9CA3AF"
						value={query}
						onChangeText={setQuery}
						autoCapitalize="none"
						returnKeyType="search"
					/>
					{query ? (
						<Pressable
							onPress={() => setQuery("")}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel="Clear search"
						>
							<Ionicons name="close-circle" size={18} color="#9CA3AF" />
						</Pressable>
					) : null}
					{/* Stays put while typing — filtering a search is exactly when you
					    want it, and it used to be displaced by the clear button. */}
					<Pressable
						onPress={() => {
							haptics.tap();
							setFiltersOpen(true);
						}}
						hitSlop={8}
						className={query ? "ml-3" : ""}
						accessibilityRole="button"
						accessibilityLabel={
							activeCount ? `Filters, ${activeCount} active` : "Filters"
						}
					>
						<Ionicons
							name="options-outline"
							size={18}
							color={filtersActive ? "#0C3226" : "#9CA3AF"}
						/>
						{filtersActive ? (
							<View className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-forest-700" />
						) : null}
					</Pressable>
				</View>
			</View>

			{/* Filter chips */}
			<View className="px-5 pb-3">
				<FlatList
					horizontal
					data={chips}
					keyExtractor={(item) => item}
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={{ gap: 8 }}
					renderItem={({ item }) => {
						const isAll = item === "all";
						const isSoon = item === "soon";
						const on = isAll
							? !filtersActive
							: isSoon
								? maxMinutes !== undefined
								: dietary.includes(item);
						const label = isAll
							? "All"
							: isSoon
								? "Expiring soon"
								: item;
						return (
							<Pressable
								onPress={() => {
									haptics.select();
									if (isAll) {
										clearFilters();
									} else if (isSoon) {
										// The chip is the shortcut; the sheet sets any other
										// window. Toggling off clears whichever one is set.
										setMaxMinutes((v) =>
											v === undefined ? SOON_MINUTES : undefined,
										);
									} else {
										toggleDietary(item);
									}
								}}
								className={`rounded-full px-4 py-2 border ${on ? "bg-forest-800 border-forest-800" : "bg-white border-gray-200"}`}
							>
								<Text
									className={`font-body-medium text-sm capitalize ${on ? "text-white" : "text-gray-600"}`}
								>
									{label}
								</Text>
							</Pressable>
						);
					}}
				/>
			</View>

			{error ? (
				<View className="flex-1 items-center justify-center px-8">
					<Text className="font-body text-gray-600 text-center mb-4">
						{error}
					</Text>
					<Button variant="outline" onPress={() => void load()}>
						Try again
					</Button>
				</View>
			) : (
				<FlatList
					data={listings}
					keyExtractor={(item) => item.id}
					contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
					showsVerticalScrollIndicator={false}
					refreshControl={
						<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
					}
					onEndReached={() => void loadMore()}
					onEndReachedThreshold={0.4}
					ListFooterComponent={
						loadingMore ? (
							<View className="py-6">
								<ActivityIndicator color="#166534" />
							</View>
						) : null
					}
					renderItem={({ item, index }) => (
						<FadeInItem index={index}>
							<ListingCard
								listing={item}
								now={now}
								featured={index === 0 && !searching}
								onPress={() => router.push(`/listing/${item.id}`)}
							/>
						</FadeInItem>
					)}
					ListEmptyComponent={
						<View className="items-center justify-center px-8 pt-24">
							<Text className="font-display-bold text-xl text-gray-900 text-center">
								{searching
									? `No matches for "${debouncedQuery}"`
									: filtersActive
										? "Nothing matches those filters"
										: "Nothing available right now"}
							</Text>
							<Text className="font-body text-gray-500 text-center mt-2">
								{searching
									? "Try a different search."
									: filtersActive
										? "Try clearing a filter to see more."
										: "Food gets posted throughout the day — check back soon."}
							</Text>
							{filtersActive && !searching && (
								<View className="mt-6">
									<Button variant="outline" onPress={clearFilters}>
										Clear filters
									</Button>
								</View>
							)}
						</View>
					}
				/>
			)}

			<FeedFilterSheet
				visible={filtersOpen}
				onClose={() => setFiltersOpen(false)}
				maxMinutes={maxMinutes}
				onMaxMinutes={setMaxMinutes}
				radiusMiles={radiusMiles}
				onRadiusMiles={setRadiusMiles}
				dietary={dietary}
				onToggleDietary={toggleDietary}
				onClearAll={clearFilters}
				hasLocation={coords !== null}
			/>
		</SafeAreaView>
	);
}
