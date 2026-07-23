import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/context/AuthContext";
import { useNow } from "@/hooks/useNow";
import { fetchMyListings, type Listing } from "@/lib/listings";
import { formatLocation, formatTimeLeft } from "@/lib/format";

const STATUS_STYLE: Record<Listing["status"], string> = {
	active: "bg-forest-100 text-forest-700",
	claimed: "bg-amber-100 text-amber-700",
	expired: "bg-gray-100 text-gray-500",
	cancelled: "bg-gray-100 text-gray-500",
};

export function OrganizerHome() {
	const router = useRouter();
	const { profile, signOut } = useAuth();
	const now = useNow();
	const [listings, setListings] = useState<Listing[]>([]);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		try {
			setListings(await fetchMyListings());
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	if (loading) return <Spinner className="flex-1 bg-cream" />;

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<View className="px-5 pt-2 pb-4 flex-row items-end justify-between">
				<View>
					<Text className="font-body text-forest-600 text-xs uppercase tracking-wide">
						Organizer
					</Text>
					<Text className="font-display font-bold text-2xl text-gray-900">
						Hi {profile?.name?.split(" ")[0]}
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

			<View className="px-5 mb-2">
				<Button size="lg" onPress={() => router.push("/post")}>
					+ Post food
				</Button>
			</View>

			<Text className="px-5 pt-4 pb-1 font-body font-medium text-gray-500 text-sm uppercase tracking-wide">
				Your posts
			</Text>

			<FlatList
				data={listings}
				keyExtractor={(item) => item.id}
				contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
				showsVerticalScrollIndicator={false}
				renderItem={({ item }) => (
					<View className="bg-white rounded-card p-4 border border-gray-100">
						<View className="flex-row items-start justify-between gap-3">
							<Text className="font-display font-bold text-base text-gray-900 flex-1">
								{item.title}
							</Text>
							<View className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[item.status].split(" ")[0]}`}>
								<Text className={`font-body text-xs font-semibold capitalize ${STATUS_STYLE[item.status].split(" ")[1]}`}>
									{item.status}
								</Text>
							</View>
						</View>
						<Text className="font-body text-gray-500 text-sm mt-1">
							{formatLocation(item.building, item.room)} ·{" "}
							{item.quantity_remaining}/{item.quantity_total} left
						</Text>
						{item.status === "active" && (
							<Text className="font-body text-forest-600 text-sm mt-1">
								{formatTimeLeft(item.expires_at, now)}
							</Text>
						)}
					</View>
				)}
				ListEmptyComponent={
					<View className="items-center justify-center px-8 pt-16">
						<Text className="font-body text-gray-500 text-center">
							No posts yet. Share surplus food and students nearby will see it
							right away.
						</Text>
					</View>
				}
			/>
		</SafeAreaView>
	);
}
