import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { NotificationBell } from "@/components/ui/NotificationBell";
import { OfflineNotice } from "@/components/ui/OfflineNotice";
import { ReflowRow } from "@/components/ui/ReflowRow";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { useDeviceLocation } from "@/hooks/useDeviceLocation";
import { useNow } from "@/hooks/useNow";
import { theme } from "@/hooks/useThemeColors";
import { ApiError } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { subscribeToListings } from "@/lib/listingStream";
import { DIETARY_TAGS, fetchFeed, type Listing } from "@/lib/listings";

// "Expiring soon" — surfaces food about to be wasted, the whole point.
const SOON_MINUTES = 20;
/**
 * How long an expired listing stays on screen before it goes.
 *
 * Not zero: food vanishing under the thumb mid-scroll is disorienting, and
 * someone watching a countdown reach zero should see it reach zero. Not long
 * either — it cannot be claimed any more, so every extra second is an offer
 * the app can't honour.
 */
const EXPIRY_GRACE_MS = 6000;

/** How often to check whether the connection came back. */
const OFFLINE_RETRY_MS = 5000;

export function RecipientFeed() {
	const router = useRouter();
	const now = useNow();
	// Dietary preferences mark matching food rather than filtering it away.
	const { profile } = useAuth();
	const prefs = profile?.dietary_prefs;

	const [listings, setListings] = useState<Listing[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [offline, setOffline] = useState(false);

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
			setOffline(false);
		} catch (err) {
			// An ApiError means the server answered and objected — a real message
			// worth showing. Anything else means the request never arrived, which
			// is a connection problem and wants a different screen entirely.
			const reachedServer = err instanceof ApiError;
			setOffline(!reachedServer);
			setError(reachedServer ? err.message : null);
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

	// Live updates over SSE, replacing polling. Refs let the subscription
	// always see the current listings and the latest `load` (which closes over
	// the active filters) without reconnecting on every filter change.
	//
	// Only the SCOPE reconnects it, because only the scope is sent to the
	// server. Coordinates are rounded to ~0.01 degrees so ordinary GPS drift
	// doesn't tear the connection down and rebuild it every few seconds, and the
	// radius is padded to cover the error that rounding introduces: the circle
	// the server filters on must be a SUPERSET of the real one. Sending a little
	// too much costs some traffic; sending too little hides food, and a missing
	// listing is indistinguishable from an empty feed.
	const canScope = coords != null && radiusMiles !== undefined;
	const scopeLat =
		coords != null && canScope ? Math.round(coords.lat * 100) / 100 : undefined;
	const scopeLng =
		coords != null && canScope ? Math.round(coords.lng * 100) / 100 : undefined;
	// Clamped because the server rejects anything over 50 outright, and a
	// rejected stream means no live updates at all.
	const scopeRadius =
		radiusMiles !== undefined && canScope
			? Math.min(50, radiusMiles + 1)
			: undefined;

	// Memoised: a fresh object literal every render would reconnect the stream
	// on every render, which is the opposite of the point.
	const scope = useMemo(
		() => ({ lat: scopeLat, lng: scopeLng, radiusMiles: scopeRadius }),
		[scopeLat, scopeLng, scopeRadius],
	);

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
		}, scope).then((fn) => {
			if (cancelled) fn();
			else close = fn;
		});

		return () => {
			cancelled = true;
			close();
		};
	}, [scope]);

	// Retry on a timer while offline. Without a connectivity library there is
	// nothing to be told that the network returned, so the only way to find out
	// is to ask — and a screen that recovers on its own is the difference
	// between waiting and being stuck.
	useEffect(() => {
		if (!offline) return;
		const id = setInterval(() => void loadRef.current(), OFFLINE_RETRY_MS);
		return () => clearInterval(id);
	}, [offline]);

	// Expired listings used to sit there until something else refetched: the
	// countdown hit zero and the card stayed, still offering food that was gone.
	// One timer for the soonest deadline, which reschedules itself as the list
	// changes, rather than a timer per row or a faster clock for every card.
	useEffect(() => {
		if (listings.length === 0) return;
		const soonest = Math.min(
			...listings.map(
				(l) => new Date(l.expires_at).getTime() + EXPIRY_GRACE_MS,
			),
		);
		const id = setTimeout(
			() => {
				const cutoff = Date.now();
				setListings((prev) => {
					const kept = prev.filter(
						(l) => new Date(l.expires_at).getTime() + EXPIRY_GRACE_MS > cutoff,
					);
					// Same array when nothing went, so this effect doesn't re-run on its
					// own output and reschedule itself forever.
					return kept.length === prev.length ? prev : kept;
				});
			},
			Math.max(soonest - Date.now(), 250),
		);
		return () => clearTimeout(id);
	}, [listings]);

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
			<SafeAreaView className="flex-1 bg-page" edges={["top"]}>
				<View className="px-5 pt-2 pb-3">
					<Text className="font-display-bold text-3xl text-brand">
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

	// Food matching the viewer's preferences floats to the top.
	//
	// Array.sort is stable, so everything keeps its soonest-first expiry order
	// within each of the two groups — preference decides the group, urgency
	// still decides the order inside it.
	//
	// ⚠ This reorders the loaded page only. The server pages by expiry, so a
	// match sitting on page three stays on page three; it rises above its
	// neighbours once fetched, not above the whole feed.
	const ordered =
		prefs && prefs.length > 0
			? [...listings].sort(
					(a, b) =>
						Number(b.dietary_tags.some((t) => prefs.includes(t))) -
						Number(a.dietary_tags.some((t) => prefs.includes(t))),
				)
			: listings;

	return (
		<SafeAreaView className="flex-1 bg-page" edges={["top"]}>
			{/* Header */}
			<View className="px-5 pt-2 pb-3 flex-row items-start justify-between">
				<View>
					<Text className="font-display-bold text-3xl text-brand">
						Discover
					</Text>
					<Text className="font-body text-gray-500 mt-0.5">
						Good food. Good impact.
					</Text>
				</View>
				{/* The bookmark on every card had nowhere to lead until now. It sits
				    beside the bell because both are "things waiting for me", and
				    because saving happens on this screen — the way back to what you
				    saved belongs where you saved it. */}
				<View className="flex-row items-center gap-4">
					<Pressable
						onPress={() => router.push("/saved")}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel="Saved food"
					>
						<Ionicons name="bookmark-outline" size={24} color={theme.brand} />
					</Pressable>
					<NotificationBell />
				</View>
			</View>

			{/* Search */}
			<View className="px-5 pb-3">
				<View className="flex-row items-center bg-card border border-gray-200 rounded-full px-4 py-2.5">
					<Ionicons name="search" size={18} color={theme.muted} />
					<TextInput
						// Size without a line height, for the reason Input documents: on
						// iOS a lineHeight on a TextInput positions the text in a line
						// box rather than in the field, and it drops after the first
						// character. This field is hand-rolled rather than an Input, so
						// it never got that fix and kept the bug on its own.
						style={{ fontSize: 16, paddingVertical: 0 }}
						className="flex-1 font-body text-gray-900 ml-2"
						placeholder="Search food, meals, or locations"
						placeholderTextColor={theme.muted}
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
							<Ionicons name="close-circle" size={18} color={theme.muted} />
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
							color={filtersActive ? theme.brand : theme.muted}
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
						const label = isAll ? "All" : isSoon ? "Expiring soon" : item;
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
								className={`rounded-full px-4 py-2 border ${on ? "bg-forest-800 border-forest-800" : "bg-card border-gray-200"}`}
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

			{/* Offline with nothing cached is the only case that takes the whole
			    screen. With food already on it, a strip is enough — stale food is
			    still worth reading, and blanking the page would throw away the only
			    useful thing left. */}
			{offline && listings.length === 0 ? (
				<OfflineNotice onRetry={() => void load()} />
			) : error ? (
				<View className="flex-1 items-center justify-center px-8">
					<Text className="font-body text-gray-600 text-center mb-4">
						{error}
					</Text>
					<Button variant="outline" onPress={() => void load()}>
						Try again
					</Button>
				</View>
			) : (
				<>
					{/* Above the list rather than inside it, so it stays put — an
					    offline warning that scrolls away is one people miss. */}
					{offline && <OfflineNotice compact onRetry={() => void load()} />}
					<FlatList
						data={ordered}
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
									<ActivityIndicator color={theme.brand} />
								</View>
							) : null
						}
						renderItem={({ item, index }) => (
							<ReflowRow>
								<FadeInItem index={index}>
									<ListingCard
										listing={item}
										now={now}
										featured={index === 0 && !searching}
										prefs={prefs}
										onPress={() => router.push(`/listing/${item.id}`)}
									/>
								</FadeInItem>
							</ReflowRow>
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
				</>
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
