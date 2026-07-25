import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useNow } from "@/hooks/useNow";
import { ApiError } from "@/lib/api";
import { createClaim } from "@/lib/claims";
import { formatLocation, formatTimeLeft } from "@/lib/format";
import { fetchListing, type Listing } from "@/lib/listings";

/** One line of the pickup-details card: an icon, a caption, and its value. */
function DetailRow({
	icon,
	label,
	value,
	sub,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	value: string;
	sub?: string | null;
}) {
	return (
		<View className="flex-row gap-3 py-2">
			<Ionicons name={icon} size={18} color="#1B4332" style={{ marginTop: 1 }} />
			<View className="flex-1">
				<Text className="font-body-semibold text-gray-900 text-sm">{label}</Text>
				<Text className="font-body text-gray-600 text-sm mt-0.5">{value}</Text>
				{sub ? (
					<Text className="font-body text-gray-400 text-xs mt-0.5">{sub}</Text>
				) : null}
			</View>
		</View>
	);
}

export default function ListingDetail() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const now = useNow();
	const toast = useToast();

	const [listing, setListing] = useState<Listing | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);

	const [claiming, setClaiming] = useState(false);
	const [claimError, setClaimError] = useState<string | null>(null);
	const [claimed, setClaimed] = useState(false);
	const [qty, setQty] = useState(1);

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
			await createClaim(listing.id, qty);
			setClaimed(true);
			toast.show("Reserved! Confirm pickup within 15 minutes.");
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

	async function onShare() {
		if (!listing) return;
		const message = `${listing.title} — free on EcoEats at ${formatLocation(
			listing.building,
			listing.room,
		)}.`;
		try {
			await Share.share({ message });
		} catch {
			// Desktop web has no share sheet — fall back to the clipboard so the
			// button still does something useful.
			const nav = (globalThis as { navigator?: Navigator }).navigator;
			if (nav?.clipboard) {
				try {
					await nav.clipboard.writeText(message);
					toast.show("Copied to clipboard.");
				} catch {
					// Nothing more we can do; stay silent rather than error.
				}
			}
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
	const expiresAt = new Date(listing.expires_at).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["bottom"]}>
			<ScrollView showsVerticalScrollIndicator={false}>
				{/* Photo with overlay controls */}
				<View className="relative">
					{cover ? (
						<Image source={{ uri: cover }} className="w-full h-72 bg-gray-100" />
					) : (
						<View className="w-full h-72 bg-forest-50 items-center justify-center">
							<Text className="font-display text-forest-300 text-2xl">
								EcoEats
							</Text>
						</View>
					)}

					<Pressable
						onPress={() => router.back()}
						hitSlop={8}
						className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/90 items-center justify-center"
						accessibilityRole="button"
						accessibilityLabel="Go back"
					>
						<Ionicons name="chevron-back" size={22} color="#163827" />
					</Pressable>
					<Pressable
						onPress={onShare}
						hitSlop={8}
						className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 items-center justify-center"
						accessibilityRole="button"
						accessibilityLabel="Share this listing"
					>
						<Ionicons name="share-outline" size={20} color="#163827" />
					</Pressable>
					<View className="absolute bottom-4 left-4 bg-forest-900 rounded-full px-3 py-1">
						<Text className="font-body-semibold text-xs text-white">
							{timeLeft}
						</Text>
					</View>
				</View>

				<View className="px-5 pt-5">
					<Text className="font-display-bold text-2xl text-gray-900">
						{listing.title}
					</Text>
					<Text className="font-body text-gray-500 mt-1">
						{formatLocation(listing.building, listing.room)}
					</Text>

					<Text className="font-body text-gray-700 mt-4 leading-6">
						{listing.description}
					</Text>

					{listing.dietary_tags.length > 0 && (
						<View className="flex-row flex-wrap gap-2 mt-4">
							{listing.dietary_tags.map((tag) => (
								<View
									key={tag}
									className="border border-gray-200 rounded-full px-3 py-1"
								>
									<Text className="font-body text-sm text-gray-600 capitalize">
										{tag}
									</Text>
								</View>
							))}
						</View>
					)}

					{listing.allergens && (
						<View className="bg-amber-50 border border-amber-200 rounded-card p-4 mt-4">
							<Text className="font-body-semibold text-amber-800 text-sm">
								Allergens & ingredients
							</Text>
							<Text className="font-body text-amber-800 text-sm mt-1">
								{listing.allergens}
							</Text>
						</View>
					)}

					{/* Pickup details */}
					<Text className="font-display-bold text-lg text-gray-900 mt-6 mb-1">
						Pickup Details
					</Text>
					<View className="bg-white rounded-card p-4 border border-gray-100">
						<DetailRow
							icon="location-outline"
							label="Where"
							value={`${listing.campus} · ${formatLocation(listing.building, listing.room)}`}
							sub={listing.placement_note}
						/>
						<DetailRow
							icon="time-outline"
							label="When"
							value="Ready for pickup now"
							sub={`Expires in ${timeLeft} (by ${expiresAt})`}
						/>
					</View>

					{/* Shared by */}
					<View className="flex-row items-center gap-3 mt-5 mb-2">
						<View className="w-10 h-10 rounded-full bg-forest-100 items-center justify-center">
							<Ionicons name="person-outline" size={20} color="#1B4332" />
						</View>
						<View className="flex-1">
							<Text className="font-body text-gray-400 text-xs">Shared by</Text>
							<Text className="font-body-semibold text-gray-900">
								{listing.organizer.name}
							</Text>
							{listing.organizer.rating != null ? (
								<View className="flex-row items-center gap-1 mt-0.5">
									<Ionicons name="star" size={12} color="#FFC627" />
									<Text className="font-body text-gray-600 text-xs">
										{listing.organizer.rating} ({listing.organizer.rating_count})
									</Text>
								</View>
							) : (
								<Text className="font-body text-gray-400 text-xs mt-0.5">
									New host
								</Text>
							)}
						</View>
						<View className="bg-maroon-50 rounded-full px-3 py-1">
							<Text className="font-body-semibold text-xs text-maroon">
								ASU Host
							</Text>
						</View>
					</View>
				</View>
			</ScrollView>

			{/* Sticky claim bar */}
			<View className="px-5 py-4 border-t border-gray-100 bg-cream">
				{claimError && (
					<Text className="font-body text-red-500 text-sm mb-2 text-center">
						{claimError}
					</Text>
				)}
				{canClaim && listing.quantity_remaining > 1 && (
					<View className="flex-row items-center justify-center gap-5 mb-3">
						<Text className="font-body text-gray-500 text-sm">Portions</Text>
						<Pressable
							onPress={() => setQty((q) => Math.max(1, q - 1))}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel="Fewer portions"
						>
							<Ionicons name="remove-circle-outline" size={30} color="#1B4332" />
						</Pressable>
						<Text className="font-display-bold text-xl text-gray-900 w-6 text-center">
							{qty}
						</Text>
						<Pressable
							onPress={() =>
								setQty((q) => Math.min(listing.quantity_remaining, 10, q + 1))
							}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel="More portions"
						>
							<Ionicons name="add-circle-outline" size={30} color="#1B4332" />
						</Pressable>
					</View>
				)}
				<Button onPress={onClaim} loading={claiming} disabled={!canClaim} size="lg">
					{canClaim
						? qty > 1
							? `Claim ${qty} Portions`
							: "Claim This Food"
						: listing.quantity_remaining === 0
							? "All claimed"
							: "No longer available"}
				</Button>
				{canClaim && (
					<Text className="font-body text-gray-400 text-xs text-center mt-2">
						You'll have 15 minutes to confirm pickup.
					</Text>
				)}
			</View>
		</SafeAreaView>
	);
}
