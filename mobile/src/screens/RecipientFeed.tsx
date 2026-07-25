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
import { ListingCard } from "@/components/ListingCard";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useNow } from "@/hooks/useNow";
import { ApiError } from "@/lib/api";
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
	const [soonOnly, setSoonOnly] = useState(false);
	// Client-side text search over the loaded page. Server-side search across the
	// whole catalogue is a Phase 2 backend feature.
	const [query, setQuery] = useState("");

	const filters = useCallback(
		() => ({
			dietary: dietary.length ? dietary : undefined,
			maxMinutes: soonOnly ? SOON_MINUTES : undefined,
		}),
		[dietary, soonOnly],
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

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		void load();
	}, [load]);

	if (loading) {
		return <Spinner className="flex-1 bg-cream" />;
	}

	const filtersActive = dietary.length > 0 || soonOnly;

	const q = query.trim().toLowerCase();
	const visible = q
		? listings.filter(
				(l) =>
					l.title.toLowerCase().includes(q) ||
					l.building.toLowerCase().includes(q) ||
					(l.room ?? "").toLowerCase().includes(q) ||
					l.campus.toLowerCase().includes(q),
			)
		: listings;

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
					accessibilityRole="button"
					accessibilityLabel="Notifications"
				>
					<Ionicons name="notifications-outline" size={24} color="#1B4332" />
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
					) : (
						<Ionicons name="options-outline" size={18} color="#9CA3AF" />
					)}
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
								? soonOnly
								: dietary.includes(item);
						const label = isAll
							? "All"
							: isSoon
								? "Expiring soon"
								: item;
						return (
							<Pressable
								onPress={() => {
									if (isAll) {
										setDietary([]);
										setSoonOnly(false);
									} else if (isSoon) {
										setSoonOnly((v) => !v);
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
					data={visible}
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
						<ListingCard
							listing={item}
							now={now}
							featured={index === 0 && !q}
							onPress={() => router.push(`/listing/${item.id}`)}
						/>
					)}
					ListEmptyComponent={
						<View className="items-center justify-center px-8 pt-24">
							<Text className="font-display-bold text-xl text-gray-900 text-center">
								{q
									? `No matches for "${query.trim()}"`
									: filtersActive
										? "Nothing matches those filters"
										: "Nothing available right now"}
							</Text>
							<Text className="font-body text-gray-500 text-center mt-2">
								{q
									? "Try a different search."
									: filtersActive
										? "Try clearing a filter to see more."
										: "Food gets posted throughout the day — check back soon."}
							</Text>
							{filtersActive && !q && (
								<View className="mt-6">
									<Button
										variant="outline"
										onPress={() => {
											setDietary([]);
											setSoonOnly(false);
										}}
									>
										Clear filters
									</Button>
								</View>
							)}
						</View>
					}
				/>
			)}
		</SafeAreaView>
	);
}
