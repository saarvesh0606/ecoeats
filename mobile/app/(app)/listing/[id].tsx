import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useNow } from "@/hooks/useNow";
import { ApiError } from "@/lib/api";
import { createClaim } from "@/lib/claims";
import { formatLocation, formatTimeLeft } from "@/lib/format";
import { fetchListing, type Listing } from "@/lib/listings";

export default function ListingDetail() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const now = useNow();

	const [listing, setListing] = useState<Listing | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);

	const [claiming, setClaiming] = useState(false);
	const [claimError, setClaimError] = useState<string | null>(null);
	const [claimed, setClaimed] = useState(false);

	const load = useCallback(async () => {
		if (!id) return;
		try {
			setLoadError(null);
			setListing(await fetchListing(id));
		} catch (err) {
			setLoadError(
				err instanceof ApiError ? err.message : "Couldn't load this listing.",
			);
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		void load();
	}, [load]);

	async function onClaim() {
		if (!listing) return;
		setClaiming(true);
		setClaimError(null);
		try {
			await createClaim(listing.id);
			setClaimed(true);
			// Land on the user's claims, where the pickup details live.
			router.replace("/claims");
		} catch (err) {
			setClaimError(
				err instanceof ApiError ? err.message : "Couldn't claim. Try again.",
			);
		} finally {
			setClaiming(false);
		}
	}

	if (loading) return <Spinner className="flex-1 bg-cream" />;

	if (loadError || !listing) {
		return (
			<SafeAreaView className="flex-1 bg-cream items-center justify-center px-8">
				<Text className="font-body text-gray-600 text-center mb-4">
					{loadError ?? "Listing not found."}
				</Text>
				<Button variant="outline" onPress={() => router.back()}>
					Go back
				</Button>
			</SafeAreaView>
		);
	}

	const timeLeft = formatTimeLeft(listing.expires_at, now);
	const cover = listing.photo_urls[0];
	const canClaim = listing.is_claimable && !claimed;

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["bottom"]}>
			<ScrollView showsVerticalScrollIndicator={false}>
				{cover ? (
					<Image source={{ uri: cover }} className="w-full h-64 bg-gray-100" />
				) : (
					<View className="w-full h-40 bg-forest-50 items-center justify-center">
						<Text className="font-display text-forest-300 text-2xl">EcoEats</Text>
					</View>
				)}

				<View className="px-5 pt-5">
					<Text
						onPress={() => router.back()}
						className="font-body text-forest-700 mb-3"
						accessibilityRole="button"
					>
						← Back
					</Text>

					<View className="flex-row items-start justify-between gap-3">
						<Text className="font-display font-bold text-2xl text-gray-900 flex-1">
							{listing.title}
						</Text>
						<Text className="font-body font-semibold text-forest-700">
							{timeLeft}
						</Text>
					</View>

					<Text className="font-body text-gray-700 mt-3 leading-6">
						{listing.description}
					</Text>

					{listing.dietary_tags.length > 0 && (
						<View className="flex-row flex-wrap gap-2 mt-4">
							{listing.dietary_tags.map((tag) => (
								<View key={tag} className="bg-forest-50 rounded-full px-3 py-1">
									<Text className="font-body text-sm text-forest-700 capitalize">
										{tag}
									</Text>
								</View>
							))}
						</View>
					)}

					{listing.allergens && (
						<View className="bg-amber-50 border border-amber-200 rounded-card p-4 mt-4">
							<Text className="font-body font-semibold text-amber-800 text-sm">
								Allergens & ingredients
							</Text>
							<Text className="font-body text-amber-800 text-sm mt-1">
								{listing.allergens}
							</Text>
						</View>
					)}

					<View className="bg-white rounded-card p-4 mt-4 border border-gray-100">
						<Text className="font-body font-semibold text-gray-900">
							Where to pick up
						</Text>
						<Text className="font-body text-gray-700 mt-1">
							{listing.campus} · {formatLocation(listing.building, listing.room)}
						</Text>
						{listing.placement_note && (
							<Text className="font-body text-gray-500 text-sm mt-1">
								{listing.placement_note}
							</Text>
						)}
					</View>

					<View className="flex-row items-center justify-between mt-4">
						<Text className="font-body text-gray-600">
							Shared by {listing.organizer.name}
						</Text>
						<Text className="font-body font-semibold text-forest-700">
							{listing.quantity_remaining} of {listing.quantity_total} left
						</Text>
					</View>
				</View>
			</ScrollView>

			<View className="px-5 py-4 border-t border-gray-100 bg-cream">
				{claimError && (
					<Text className="font-body text-red-500 text-sm mb-2 text-center">
						{claimError}
					</Text>
				)}
				<Button onPress={onClaim} loading={claiming} disabled={!canClaim} size="lg">
					{canClaim
						? "Claim a portion"
						: listing.quantity_remaining === 0
							? "All claimed"
							: "No longer available"}
				</Button>
			</View>
		</SafeAreaView>
	);
}
