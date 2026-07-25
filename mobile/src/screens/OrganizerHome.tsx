import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/context/AuthContext";
import {
	fetchImpact,
	fetchMyListings,
	type HostImpact,
	type Listing,
} from "@/lib/listings";
import { formatLocation } from "@/lib/format";

type Tab = "active" | "scheduled" | "past";

const TABS: { key: Tab; label: string }[] = [
	{ key: "active", label: "Active" },
	{ key: "scheduled", label: "Scheduled" },
	{ key: "past", label: "Past" },
];

function Stat({ n, label }: { n: number; label: string }) {
	return (
		<View className="items-center flex-1">
			<Text className="font-display-bold text-2xl text-white">{n}</Text>
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
	const [tab, setTab] = useState<Tab>("active");

	const load = useCallback(async () => {
		try {
			const [posts, stats] = await Promise.all([
				fetchMyListings(),
				fetchImpact(),
			]);
			setListings(posts);
			setImpact(stats);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	if (loading) return <Spinner className="flex-1 bg-cream" />;

	const firstName = profile?.name?.split(" ")[0] ?? "Sun Devil";

	const inTab = (l: Listing): boolean =>
		tab === "active"
			? l.status === "active"
			: tab === "past"
				? l.status !== "active"
				: false; // "scheduled" — Phase 2

	const visible = listings.filter(inTab);

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			{/* Header */}
			<View className="px-5 pt-2 pb-3 flex-row items-start justify-between">
				<View>
					<Text className="font-display-bold text-3xl text-forest-800">
						Host Dashboard
					</Text>
					<Text className="font-body text-gray-500 mt-0.5">
						Good to share, {firstName}.
					</Text>
				</View>
				<Pressable
					hitSlop={8}
					className="mt-1"
					onPress={() => router.push("/notifications")}
					accessibilityRole="button"
					accessibilityLabel="Notifications"
				>
					<Ionicons name="notifications-outline" size={24} color="#1B4332" />
				</Pressable>
			</View>

			{/* Impact card */}
			<View className="mx-5 bg-forest-800 rounded-card p-4 mb-4">
				<Text className="font-body-medium text-forest-100 text-xs uppercase tracking-wide mb-3">
					Your Impact
				</Text>
				<View className="flex-row justify-between">
					<Stat n={impact?.meals_shared ?? 0} label="Meals Shared" />
					<Stat n={impact?.people_fed ?? 0} label="People Fed" />
					<Stat n={impact?.active_posts ?? 0} label="Active Posts" />
				</View>
			</View>

			{/* Tabs */}
			<View className="px-5 pb-3 flex-row gap-2">
				{TABS.map(({ key, label }) => {
					const on = tab === key;
					return (
						<Pressable
							key={key}
							onPress={() => setTab(key)}
							className={`rounded-full px-4 py-2 border ${on ? "bg-forest-800 border-forest-800" : "bg-white border-gray-200"}`}
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
				renderItem={({ item }) => {
					const cover = item.photo_urls[0];
					const live = item.status === "active";
					return (
						<Pressable
							onPress={() => router.push(`/manage/${item.id}`)}
							className="bg-white rounded-card p-4 border border-gray-100 active:opacity-90"
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
										<Ionicons name="fast-food-outline" size={22} color="#86d6ad" />
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
												<Text className="font-body-medium text-forest-600 text-xs">
													Live
												</Text>
											</View>
										)}
										<Text className="font-body text-gray-500 text-xs">
											<Text className="font-body-semibold text-gray-900">
												{item.quantity_remaining} left
											</Text>{" "}
											of {item.quantity_total} servings
										</Text>
									</View>
								</View>
								<Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
							</View>
						</Pressable>
					);
				}}
				ListFooterComponent={
					<View className="mt-2">
						<Button variant="outline" size="lg" onPress={() => router.push("/post")}>
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
								? "Scheduling posts ahead of time is coming soon."
								: "Share surplus food and students nearby will see it right away."}
						</Text>
					</View>
				}
			/>
		</SafeAreaView>
	);
}
