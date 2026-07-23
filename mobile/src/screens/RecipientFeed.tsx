import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ListingCard } from "@/components/ListingCard";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/context/AuthContext";
import { useNow } from "@/hooks/useNow";
import { ApiError } from "@/lib/api";
import { fetchFeed, type Listing } from "@/lib/listings";

export function RecipientFeed() {
	const router = useRouter();
	const { profile, signOut } = useAuth();
	const now = useNow();

	const [listings, setListings] = useState<Listing[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setError(null);
			setListings(await fetchFeed());
		} catch (err) {
			setError(
				err instanceof ApiError ? err.message : "Couldn't load food nearby.",
			);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	// Light polling keeps quantities roughly fresh until a realtime channel
	// replaces it. The countdown itself ticks locally via `now`.
	useEffect(() => {
		const id = setInterval(() => void load(), 20000);
		return () => clearInterval(id);
	}, [load]);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		void load();
	}, [load]);

	if (loading) {
		return <Spinner className="flex-1 bg-cream" />;
	}

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<View className="px-5 pt-2 pb-4 flex-row items-end justify-between">
				<View>
					<Text className="font-body text-forest-600 text-xs uppercase tracking-wide">
						Available now
					</Text>
					<Text className="font-display font-bold text-2xl text-gray-900">
						Hi {profile?.name?.split(" ")[0] ?? "there"}
					</Text>
				</View>
				<Text
					onPress={signOut}
					className="font-body text-sm text-gray-400 pb-1"
					accessibilityRole="button"
				>
					Sign out
				</Text>
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
								Nothing available right now
							</Text>
							<Text className="font-body text-gray-500 text-center mt-2">
								Food gets posted throughout the day — check back soon.
							</Text>
						</View>
					}
				/>
			)}
		</SafeAreaView>
	);
}
