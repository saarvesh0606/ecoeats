import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ListingCard } from "@/components/ListingCard";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/context/AuthContext";
import { useNow } from "@/hooks/useNow";
import { ApiError } from "@/lib/api";
import { DIETARY_TAGS, fetchFeed, type Listing } from "@/lib/listings";
import { subscribeToListings } from "@/lib/listingStream";

// "Expiring soon" — surfaces food about to be wasted, the whole point.
const SOON_MINUTES = 20;

export function RecipientFeed() {
	const router = useRouter();
	const { profile } = useAuth();
	const now = useNow();

	const [listings, setListings] = useState<Listing[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const [dietary, setDietary] = useState<string[]>([]);
	const [soonOnly, setSoonOnly] = useState(false);

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
			const known = listingsRef.current.some(
				(l) => l.id === event.listing_id,
			);
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

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<View className="px-5 pt-2 pb-3">
				<Text className="font-body text-forest-600 text-xs uppercase tracking-wide">
					Available now
				</Text>
				<Text className="font-display font-bold text-2xl text-gray-900">
					Hi {profile?.name?.split(" ")[0] ?? "there"}
				</Text>
			</View>

			{/* Filters */}
			<View className="px-5 pb-3">
				<FlatList
					horizontal
					data={["soon", ...DIETARY_TAGS]}
					keyExtractor={(item) => item}
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={{ gap: 8 }}
					renderItem={({ item }) => {
						const isSoon = item === "soon";
						const on = isSoon ? soonOnly : dietary.includes(item);
						return (
							<Pressable
								onPress={() =>
									isSoon ? setSoonOnly((v) => !v) : toggleDietary(item)
								}
								className={`rounded-full px-3 py-1.5 border ${on ? "bg-forest-700 border-forest-700" : "bg-white border-gray-300"}`}
							>
								<Text
									className={`font-body text-sm capitalize ${on ? "text-white" : "text-gray-700"}`}
								>
									{isSoon ? "⏱ Expiring soon" : item}
								</Text>
							</Pressable>
						);
					}}
				/>
			</View>

			{error ? (
				<View className="flex-1 items-center justify-center px-8">
					<Text className="font-body text-gray-600 text-center mb-4">{error}</Text>
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
					renderItem={({ item }) => (
						<ListingCard
							listing={item}
							now={now}
							onPress={() => router.push(`/listing/${item.id}`)}
						/>
					)}
					ListEmptyComponent={
						<View className="items-center justify-center px-8 pt-24">
							<Text className="font-display font-bold text-xl text-gray-900 text-center">
								{filtersActive ? "Nothing matches those filters" : "Nothing available right now"}
							</Text>
							<Text className="font-body text-gray-500 text-center mt-2">
								{filtersActive
									? "Try clearing a filter to see more."
									: "Food gets posted throughout the day — check back soon."}
							</Text>
							{filtersActive && (
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
