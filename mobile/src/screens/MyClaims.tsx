import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useNow } from "@/hooks/useNow";
import { ApiError } from "@/lib/api";
import { cancelClaim, type Claim, fetchMyClaims } from "@/lib/claims";
import { formatLocation } from "@/lib/format";

type Tab = "active" | "picked_up" | "expired";

const TABS: { key: Tab; label: string }[] = [
	{ key: "active", label: "Active" },
	{ key: "picked_up", label: "Picked Up" },
	{ key: "expired", label: "Expired" },
];

const STATUS_LABEL: Record<Claim["status"], string> = {
	pending: "Reserved",
	picked_up: "Picked up",
	no_show: "Expired",
	cancelled: "Cancelled",
};

const PICKUP_STEPS = [
	"Go to the pickup location listed above.",
	"Check in with the host when you arrive.",
	"Bring your own bag or container.",
	"Be kind and help reduce food waste!",
];

/** Minutes:seconds left on a reservation hold. */
function mmss(target: string, now: number): string {
	const ms = new Date(target).getTime() - now;
	if (ms <= 0) return "0:00";
	const total = Math.floor(ms / 1000);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

function PickupChecklist() {
	return (
		<View className="bg-white rounded-card p-4 border border-gray-100 mt-2">
			<Text className="font-display-bold text-base text-gray-900 mb-2">
				How to Pick Up
			</Text>
			{PICKUP_STEPS.map((step) => (
				<View key={step} className="flex-row gap-2 py-1">
					<Ionicons name="checkmark-circle" size={18} color="#1B4332" />
					<Text className="font-body text-gray-600 text-sm flex-1">{step}</Text>
				</View>
			))}
		</View>
	);
}

export function MyClaims() {
	const router = useRouter();
	const toast = useToast();
	// Tick every second — this screen shows a live MM:SS reservation countdown,
	// so the default (coarser) interval would make the seconds look frozen.
	const now = useNow(1000);
	const [claims, setClaims] = useState<Claim[]>([]);
	const [loading, setLoading] = useState(true);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [tab, setTab] = useState<Tab>("active");

	const load = useCallback(async () => {
		try {
			setClaims(await fetchMyClaims());
		} catch {
			// Keep whatever we had; the list simply won't refresh.
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function onCancel(claim: Claim) {
		setBusyId(claim.id);
		try {
			await cancelClaim(claim.id);
			await load();
			toast.show("Claim cancelled.");
		} catch (err) {
			if (!(err instanceof ApiError)) throw err;
		} finally {
			setBusyId(null);
		}
	}

	if (loading) return <Spinner className="flex-1 bg-cream" />;

	const inTab = (c: Claim): boolean =>
		tab === "active"
			? c.status === "pending"
			: tab === "picked_up"
				? c.status === "picked_up"
				: c.status === "no_show" || c.status === "cancelled";

	const visible = claims.filter(inTab);

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<View className="px-5 pt-2 pb-3">
				<Text className="font-display-bold text-3xl text-forest-800">
					My Claims
				</Text>
				<Text className="font-body text-gray-500 mt-0.5">
					Your reserved food and pickup info.
				</Text>
			</View>

			{/* Status tabs */}
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
				contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
				showsVerticalScrollIndicator={false}
				renderItem={({ item }) => {
					const l = item.listing;
					const active = item.status === "pending";
					const cover = l?.photo_urls[0];
					return (
						<View className="bg-white rounded-card p-4 border border-gray-100">
							<View className="flex-row gap-3">
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
									<View className="flex-row items-center gap-2">
										<Text className="font-body-semibold text-[11px] text-forest-700 uppercase tracking-wide">
											{STATUS_LABEL[item.status]}
										</Text>
									</View>
									<Text
										className="font-display-bold text-lg text-gray-900"
										numberOfLines={1}
									>
										{l?.title ?? "Listing"}
									</Text>
									{l && (
										<Text
											className="font-body text-gray-500 text-sm"
											numberOfLines={1}
										>
											{formatLocation(l.building, l.room)}
										</Text>
									)}
								</View>
							</View>

							{active && (
								<View className="flex-row items-end justify-between mt-4 mb-1">
									<View>
										<Text className="font-body text-gray-400 text-xs">
											Time remaining
										</Text>
										<Text className="font-display-bold text-2xl text-forest-800">
											{mmss(item.reservation_expires_at, now)}
										</Text>
									</View>
									<Text className="font-body text-gray-400 text-xs mb-1">
										min : sec
									</Text>
								</View>
							)}

							{active && l && (
								<View className="flex-row gap-3 mt-3">
									<View className="flex-1">
										<Button
											size="sm"
											onPress={() => void Linking.openURL(l.directions_url)}
										>
											Directions
										</Button>
									</View>
									<View className="flex-1">
										<Button
											size="sm"
											variant="outline"
											loading={busyId === item.id}
											onPress={() => onCancel(item)}
										>
											Cancel
										</Button>
									</View>
								</View>
							)}

							{l && (
								<Pressable
									onPress={() => router.push(`/listing/${l.id}`)}
									className="mt-3"
									accessibilityRole="button"
									accessibilityLabel={`View details for ${l.title}`}
								>
									<Text className="font-body-semibold text-forest-700 text-sm text-center">
										View Details
									</Text>
								</Pressable>
							)}
						</View>
					);
				}}
				ListFooterComponent={
					tab === "active" && visible.length > 0 ? <PickupChecklist /> : null
				}
				ListEmptyComponent={
					<View className="items-center justify-center px-8 pt-24">
						<Text className="font-display-bold text-xl text-gray-900 text-center">
							{tab === "active" ? "No active claims" : "Nothing here yet"}
						</Text>
						<Text className="font-body text-gray-500 text-center mt-2">
							{tab === "active"
								? "When you claim food, it shows up here with pickup details."
								: "Your past claims will appear here."}
						</Text>
						{tab === "active" && (
							<View className="mt-6">
								<Button variant="outline" onPress={() => router.replace("/feed")}>
									Browse food
								</Button>
							</View>
						)}
					</View>
				}
			/>
		</SafeAreaView>
	);
}
