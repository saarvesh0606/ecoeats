import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useNow } from "@/hooks/useNow";
import { ApiError } from "@/lib/api";
import {
	type Claim,
	confirmPickup,
	fetchListingClaims,
	markNoShow,
} from "@/lib/claims";
import { formatTimeLeft } from "@/lib/format";
import {
	cancelListing,
	fetchListing,
	type Listing,
	setListingStatus,
} from "@/lib/listings";

const STATUS_LABEL: Record<Claim["status"], string> = {
	pending: "Waiting for pickup",
	picked_up: "Picked up",
	no_show: "No-show",
	cancelled: "Cancelled by them",
};

const STATUS_STYLE: Record<Claim["status"], string> = {
	pending: "bg-forest-100 text-forest-700",
	picked_up: "bg-forest-700 text-white",
	no_show: "bg-red-100 text-red-700",
	cancelled: "bg-gray-100 text-gray-500",
};

/** Confirm a destructive action; native gets an Alert, web a window.confirm. */
async function confirmAction(message: string): Promise<boolean> {
	if (Platform.OS === "web") {
		return typeof window !== "undefined" ? window.confirm(message) : true;
	}
	return new Promise((resolve) => {
		Alert.alert("Are you sure?", message, [
			{ text: "Cancel", style: "cancel", onPress: () => resolve(false) },
			{ text: "Yes", style: "destructive", onPress: () => resolve(true) },
		]);
	});
}

export default function ManageListing() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const now = useNow();

	const [listing, setListing] = useState<Listing | null>(null);
	const [claims, setClaims] = useState<Claim[]>([]);
	const [loading, setLoading] = useState(true);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!id) return;
		try {
			const [l, c] = await Promise.all([
				fetchListing(id),
				fetchListingClaims(id),
			]);
			setListing(l);
			setClaims(c);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Couldn't load this post.");
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		void load();
	}, [load]);

	async function act(
		key: string,
		fn: () => Promise<unknown>,
		confirm?: string,
	) {
		if (confirm && !(await confirmAction(confirm))) return;
		setBusyId(key);
		setError(null);
		try {
			await fn();
			await load();
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Something went wrong.");
		} finally {
			setBusyId(null);
		}
	}

	if (loading) return <Spinner className="flex-1 bg-cream" />;

	if (!listing) {
		return (
			<SafeAreaView className="flex-1 bg-cream items-center justify-center px-8">
				<Text className="font-body text-gray-600 text-center mb-4">
					{error ?? "Post not found."}
				</Text>
				<Button variant="outline" onPress={() => router.replace("/home")}>
					Back to your posts
				</Button>
			</SafeAreaView>
		);
	}

	const isOpen = listing.status === "active" || listing.status === "claimed";
	const waiting = claims.filter((c) => c.status === "pending").length;

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<View className="px-5 pt-2 pb-3">
				<Text
					onPress={() => router.replace("/home")}
					className="font-body text-forest-700 mb-2"
					accessibilityRole="button"
				>
					← Your posts
				</Text>
				<Text className="font-display font-bold text-2xl text-gray-900">
					{listing.title}
				</Text>
				<Text className="font-body text-gray-500 mt-1 capitalize">
					{listing.status} · {listing.quantity_remaining}/
					{listing.quantity_total} left
					{listing.status === "active"
						? ` · ${formatTimeLeft(listing.expires_at, now)}`
						: ""}
				</Text>
			</View>

			{error && (
				<Text className="font-body text-red-500 text-sm px-5 pb-2">{error}</Text>
			)}

			<FlatList
				data={claims}
				keyExtractor={(item) => item.id}
				contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
				showsVerticalScrollIndicator={false}
				ListHeaderComponent={
					isOpen ? (
						<View className="flex-row gap-3 mb-2">
							{listing.status === "active" ? (
								<View className="flex-1">
									<Button
										variant="outline"
										size="sm"
										loading={busyId === "stock"}
										onPress={() =>
											act("stock", () => setListingStatus(listing.id, "claimed"))
										}
									>
										Mark out of stock
									</Button>
								</View>
							) : (
								<View className="flex-1">
									<Button
										variant="outline"
										size="sm"
										loading={busyId === "stock"}
										onPress={() =>
											act("stock", () => setListingStatus(listing.id, "active"))
										}
									>
										Reopen
									</Button>
								</View>
							)}
							<View className="flex-1">
								<Button
									variant="ghost"
									size="sm"
									loading={busyId === "cancel"}
									onPress={() =>
										act(
											"cancel",
											() => cancelListing(listing.id),
											"Cancel this whole post? It will disappear for everyone.",
										)
									}
								>
									Cancel post
								</Button>
							</View>
						</View>
					) : null
				}
				renderItem={({ item }) => (
					<View className="bg-white rounded-card p-4 border border-gray-100">
						<View className="flex-row items-center justify-between gap-3">
							<Text className="font-display font-bold text-base text-gray-900">
								{item.recipient_name}
							</Text>
							<View className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[item.status].split(" ")[0]}`}>
								<Text className={`font-body text-xs font-semibold ${STATUS_STYLE[item.status].split(" ").slice(1).join(" ")}`}>
									{STATUS_LABEL[item.status]}
								</Text>
							</View>
						</View>
						<Text className="font-body text-gray-500 text-sm mt-1">
							{item.quantity} portion{item.quantity > 1 ? "s" : ""}
						</Text>

						{item.status === "pending" && (
							<View className="flex-row gap-3 mt-4">
								<View className="flex-1">
									<Button
										size="sm"
										loading={busyId === `pickup-${item.id}`}
										onPress={() =>
											act(`pickup-${item.id}`, () => confirmPickup(item.id))
										}
									>
										Confirm pickup
									</Button>
								</View>
								<View className="flex-1">
									<Button
										size="sm"
										variant="outline"
										loading={busyId === `noshow-${item.id}`}
										onPress={() =>
											act(
												`noshow-${item.id}`,
												() => markNoShow(item.id),
												"Mark as no-show? Their portion goes back into the pool.",
											)
										}
									>
										No-show
									</Button>
								</View>
							</View>
						)}
					</View>
				)}
				ListEmptyComponent={
					<View className="items-center justify-center px-8 pt-16">
						<Text className="font-body text-gray-500 text-center">
							No claims yet. When someone reserves a portion, they'll appear here
							so you can confirm the handoff.
						</Text>
					</View>
				}
				ListFooterComponent={
					claims.length > 0 ? (
						<Text className="font-body text-gray-400 text-xs text-center mt-3">
							{waiting} waiting to be picked up
						</Text>
					) : null
				}
			/>
		</SafeAreaView>
	);
}
