import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ListingCard } from "@/components/ListingCard";
import { Button } from "@/components/ui/Button";
import { FadeInItem } from "@/components/ui/FadeInItem";
import { ReflowRow } from "@/components/ui/ReflowRow";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { useNow } from "@/hooks/useNow";
import { theme } from "@/hooks/useThemeColors";
import { fetchSaved, type Listing } from "@/lib/listings";

/**
 * The food someone bookmarked.
 *
 * The card has carried a bookmark button since it was written, and the API has
 * stored what it saved, and fetchSaved has existed to read it back — with no
 * screen calling it. So the button worked, in the sense that it recorded
 * something nobody could ever look at.
 *
 * Saved food still expires. Rather than hide what has gone, the list keeps it
 * and says so: a bookmark that quietly disappears leaves someone wondering
 * whether they imagined saving it, and "you missed this one" is worth knowing
 * — it is the feedback that teaches people to check sooner.
 */
export function SavedListings() {
	const router = useRouter();
	const now = useNow();
	const { profile } = useAuth();
	const prefs = profile?.dietary_prefs;

	const [saved, setSaved] = useState<Listing[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);

	const load = useCallback(async () => {
		try {
			setSaved(await fetchSaved());
		} catch {
			// Keep whatever is on screen; the pull-to-refresh is the retry.
		} finally {
			setLoading(false);
		}
	}, []);

	// Bookmarks are made on the feed, so this screen is almost always arrived at
	// with something new to show.
	useFocusEffect(
		useCallback(() => {
			void load();
		}, [load]),
	);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		void load().finally(() => setRefreshing(false));
	}, [load]);

	const header = (
		<View className="px-5 pt-2 pb-3 flex-row items-center gap-2">
			<Pressable
				onPress={() => router.back()}
				hitSlop={8}
				accessibilityRole="button"
				accessibilityLabel="Back"
			>
				<Ionicons name="chevron-back" size={24} color={theme.brand} />
			</Pressable>
			<Text className="font-display-bold text-2xl text-brand">Saved</Text>
		</View>
	);

	if (loading) {
		return (
			<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
				{header}
				<SkeletonList count={3} />
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			{header}
			<FlatList
				data={saved}
				keyExtractor={(item) => item.id}
				contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
				renderItem={({ item, index }) => (
					<ReflowRow>
						<FadeInItem index={index}>
							<ListingCard
								listing={item}
								now={now}
								prefs={prefs}
								onPress={() => router.push(`/listing/${item.id}`)}
							/>
						</FadeInItem>
					</ReflowRow>
				)}
				ListEmptyComponent={
					<View className="items-center justify-center px-8 pt-24">
						<Ionicons name="bookmark-outline" size={40} color={theme.muted} />
						<Text className="font-display-bold text-xl text-gray-900 text-center mt-4">
							Nothing saved yet
						</Text>
						<Text className="font-body text-gray-500 text-center mt-2">
							Tap the bookmark on any listing to keep it here.
						</Text>
						<View className="mt-6">
							<Button variant="outline" onPress={() => router.replace("/feed")}>
								Browse food
							</Button>
						</View>
					</View>
				}
			/>
		</SafeAreaView>
	);
}
