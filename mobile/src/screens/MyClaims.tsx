import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
	FlatList,
	Image,
	Pressable,
	RefreshControl,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { FadeInItem } from "@/components/ui/FadeInItem";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useNow } from "@/hooks/useNow";
import { useRefreshOnPush } from "@/hooks/useRefreshOnPush";
import { ApiError } from "@/lib/api";
import { cancelClaim, type Claim, fetchMyClaims, rateHost } from "@/lib/claims";
import { formatLocation } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { openDirections } from "@/lib/maps";

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

/**
 * Five stars that fill the instant one is pressed.
 *
 * They used to render as outlines unconditionally, so a tap changed nothing on
 * screen until rateHost and a full reload had both come back — a second or two
 * on a good connection, considerably worse on a cold API. With no feedback the
 * natural reading is that the tap missed, so people tap again, and the only
 * visible result is the row eventually vanishing. Which star was pressed is
 * known locally and immediately; there is no reason to make the network prove
 * it first.
 */
function StarRow({
	onPick,
	busy = false,
}: {
	onPick: (stars: number) => void;
	busy?: boolean;
}) {
	const [picked, setPicked] = useState(0);

	return (
		<View className="flex-row gap-1 mt-1">
			{[1, 2, 3, 4, 5].map((n) => (
				<Pressable
					key={n}
					// Further taps while it saves would only race the request.
					disabled={busy}
					onPress={() => {
						setPicked(n);
						haptics.select();
						onPick(n);
					}}
					hitSlop={6}
					accessibilityRole="button"
					accessibilityState={{ selected: n <= picked, disabled: busy }}
					accessibilityLabel={`Rate ${n} star${n > 1 ? "s" : ""}`}
				>
					<Ionicons
						name={n <= picked ? "star" : "star-outline"}
						size={28}
						color="#FFC627"
						style={{ opacity: busy && n > picked ? 0.5 : 1 }}
					/>
				</Pressable>
			))}
		</View>
	);
}

function PickupChecklist() {
	return (
		<View className="bg-white rounded-card p-4 border border-gray-100 mt-2">
			<Text className="font-display-bold text-base text-gray-900 mb-2">
				How to Pick Up
			</Text>
			{PICKUP_STEPS.map((step) => (
				<View key={step} className="flex-row gap-2 py-1">
					<Ionicons name="checkmark-circle" size={18} color="#0C3226" />
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
	const [refreshing, setRefreshing] = useState(false);

	const load = useCallback(async () => {
		try {
			setClaims(await fetchMyClaims());
		} catch {
			// Keep whatever we had; the list simply won't refresh.
		} finally {
			setLoading(false);
		}
	}, []);

	// Three ways this screen gets current, because it used to have none.
	//
	// It loaded once on mount and then froze: a claim the host confirmed while
	// you watched went on counting down as though nothing had happened. Worse
	// than stale, because useNow ticks the MM:SS every second regardless — the
	// screen looked live while showing collected food. A frozen screen invites
	// distrust; a ticking one gets believed.
	//
	//  - **A push arrives.** The only signal that the server changed something
	//    while the user is holding still, and the case that actually matters:
	//    waiting on this screen to collect is the whole reason to be on it.
	//    The listing SSE stream can't serve here — it carries listings, not
	//    claims.
	//  - **The screen regains focus.** Covers coming back from the feed or a
	//    listing, and anything that happened while the app was away.
	//  - **A pull.** The one the user reaches for when they don't trust the
	//    other two, and what RecipientFeed already offers.
	useFocusEffect(
		useCallback(() => {
			void load();
		}, [load]),
	);

	useRefreshOnPush(load);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		void load().finally(() => setRefreshing(false));
	}, [load]);

	async function onCancel(claim: Claim) {
		setBusyId(claim.id);
		try {
			await cancelClaim(claim.id);
			await load();
			// Giving food back is a success, but not a triumph — it lands as one
			// clean confirmation rather than anything celebratory.
			haptics.success();
			toast.show("Claim cancelled.");
		} catch (err) {
			// The API refusing (the hold already expired, say) is silent otherwise:
			// the row just doesn't change. This is the only sign it was refused.
			haptics.error();
			if (!(err instanceof ApiError)) throw err;
		} finally {
			setBusyId(null);
		}
	}

	async function onRate(claim: Claim, stars: number) {
		// Marks the row busy so the stars stop taking presses while it saves.
		setBusyId(claim.id);
		try {
			await rateHost(claim.id, stars);
			await load();
			haptics.success();
			toast.show("Thanks for rating!");
		} catch (err) {
			haptics.error();
			if (!(err instanceof ApiError)) throw err;
		} finally {
			setBusyId(null);
		}
	}

	if (loading) {
		return (
			<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
				<View className="px-5 pt-2 pb-3">
					<Text className="font-display-bold text-3xl text-forest-800">
						My Claims
					</Text>
				</View>
				<SkeletonList count={3} variant="row" />
			</SafeAreaView>
		);
	}

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
							onPress={() => {
								haptics.select();
								setTab(key);
							}}
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
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
				renderItem={({ item, index }) => {
					const l = item.listing;
					const active = item.status === "pending";
					const cover = l?.photo_urls[0];
					return (
						<FadeInItem
							index={index}
							className="bg-white rounded-card p-4 border border-gray-100"
						>
							<View className="flex-row gap-3">
								{cover ? (
									<Image
										source={{ uri: cover }}
										className="w-16 h-16 rounded-xl bg-gray-100"
									/>
								) : (
									<View className="w-16 h-16 rounded-xl bg-forest-50 items-center justify-center">
										<Ionicons name="fast-food-outline" size={22} color="#A8CFBD" />
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
											onPress={() => void openDirections(l.lat, l.lng, l.title)}
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

							{item.status === "picked_up" &&
								(item.is_rated ? (
									<Text className="font-body text-forest-700 text-sm mt-3">
										★ You rated this host — thanks!
									</Text>
								) : (
									<View className="mt-3">
										<Text className="font-body text-gray-500 text-sm">
											How was it? Rate the host:
										</Text>
										<StarRow
											onPick={(n) => onRate(item, n)}
											busy={busyId === item.id}
										/>
									</View>
								))}

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
						</FadeInItem>
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
