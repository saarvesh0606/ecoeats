import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ListingCard } from "@/components/ListingCard";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/context/AuthContext";
import { useNow } from "@/hooks/useNow";
import { ApiError } from "@/lib/api";
import { DIETARY_TAGS, fetchFeed, type Listing } from "@/lib/listings";

// "Expiring soon" — surfaces food about to be wasted, the whole point.
const SOON_MINUTES = 20;

export function RecipientFeed() {
	const router = useRouter();
	const { profile } = useAuth();
	const now = useNow();

	const [listings, setListings] = useState<Listing[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [dietary, setDietary] = useState<string[]>([]);
	const [soonOnly, setSoonOnly] = useState(false);

	const load = useCallback(async () => {
		try {
			setError(null);
			setListings(
				await fetchFeed({
					dietary: dietary.length ? dietary : undefined,
					maxMinutes: soonOnly ? SOON_MINUTES : undefined,
				}),
			);
		} catch (err) {
			setError(
				err instanceof ApiError ? err.message : "Couldn't load food nearby.",
			);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, [dietary, soonOnly]);

	useEffect(() => {
		void load();
	}, [load]);

	// Light polling keeps quantities roughly fresh until a realtime channel
	// replaces it. The countdown itself ticks locally via `now`.
	useEffect(() => {
		const id = setInterval(() => void load(), 20000);
		return () => clearInterval(id);
	}, [load]);

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
