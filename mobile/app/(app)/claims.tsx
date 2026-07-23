import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Linking, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useNow } from "@/hooks/useNow";
import { ApiError } from "@/lib/api";
import { cancelClaim, type Claim, fetchMyClaims } from "@/lib/claims";
import { formatLocation, formatTimeLeft } from "@/lib/format";

const STATUS_LABEL: Record<Claim["status"], string> = {
	pending: "Reserved",
	picked_up: "Picked up",
	no_show: "Expired",
	cancelled: "Cancelled",
};

const STATUS_STYLE: Record<Claim["status"], string> = {
	pending: "bg-forest-100 text-forest-700",
	picked_up: "bg-gray-100 text-gray-600",
	no_show: "bg-red-100 text-red-700",
	cancelled: "bg-gray-100 text-gray-500",
};

export default function MyClaims() {
	const router = useRouter();
	const now = useNow();
	const [claims, setClaims] = useState<Claim[]>([]);
	const [loading, setLoading] = useState(true);
	const [busyId, setBusyId] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setClaims(await fetchMyClaims());
		} catch {
			// Leave whatever we had; the list simply won't refresh.
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
		} catch (err) {
			if (!(err instanceof ApiError)) throw err;
		} finally {
			setBusyId(null);
		}
	}

	if (loading) return <Spinner className="flex-1 bg-cream" />;

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
				<Text className="font-display font-bold text-2xl text-gray-900">
					My claims
				</Text>
				<Text
					onPress={() => router.replace("/home")}
					className="font-body text-forest-700"
					accessibilityRole="button"
				>
					Browse food
				</Text>
			</View>

			<FlatList
				data={claims}
				keyExtractor={(item) => item.id}
				contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
				showsVerticalScrollIndicator={false}
				renderItem={({ item }) => {
					const l = item.listing;
					const isPending = item.status === "pending";
					return (
						<View className="bg-white rounded-card p-4 border border-gray-100">
							<View className="flex-row items-start justify-between gap-3">
								<Text className="font-display font-bold text-lg text-gray-900 flex-1">
									{l?.title ?? "Listing"}
								</Text>
								<View className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[item.status].split(" ")[0]}`}>
									<Text className={`font-body text-xs font-semibold ${STATUS_STYLE[item.status].split(" ")[1]}`}>
										{STATUS_LABEL[item.status]}
									</Text>
								</View>
							</View>

							{l && (
								<Text className="font-body text-gray-500 text-sm mt-1">
									{l.campus} · {formatLocation(l.building, l.room)}
								</Text>
							)}
							{l?.placement_note && (
								<Text className="font-body text-gray-400 text-sm mt-0.5">
									{l.placement_note}
								</Text>
							)}

							{isPending && (
								<Text className="font-body text-forest-700 text-sm font-semibold mt-2">
									Pick up within {formatTimeLeft(item.reservation_expires_at, now)}
								</Text>
							)}

							{isPending && l && (
								<View className="flex-row gap-3 mt-4">
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
						</View>
					);
				}}
				ListEmptyComponent={
					<View className="items-center justify-center px-8 pt-24">
						<Text className="font-display font-bold text-xl text-gray-900 text-center">
							No claims yet
						</Text>
						<Text className="font-body text-gray-500 text-center mt-2">
							When you claim food, it shows up here with pickup details.
						</Text>
					</View>
				}
			/>
		</SafeAreaView>
	);
}
