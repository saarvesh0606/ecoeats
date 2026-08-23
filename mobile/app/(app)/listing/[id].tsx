import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, Pressable, Share, Text, View } from "react-native";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useNow } from "@/hooks/useNow";
import { ApiError } from "@/lib/api";
import { createClaim } from "@/lib/claims";
import { formatDuration, formatLocation, formatTimeLeft } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { fetchListing, type Listing } from "@/lib/listings";
import { openDirections } from "@/lib/maps";

/** Hero photo height; the parallax range is derived from it. */
const HERO_HEIGHT = 288;
/** How far the claim bar travels up on entry. */
const BAR_TRAVEL = 28;

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
			<Ionicons name={icon} size={18} color="#0C3226" style={{ marginTop: 1 }} />
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
	// The hero photo is meant to run under the status bar, so this screen opts
	// out of the top safe-area edge. The controls floating on top of it must
	// not: a flat offset puts them inside the clock and the signal bars on any
	// notched phone. They get the inset the container gave up.
	const insets = useSafeAreaInsets();
	const toast = useToast();

	const [listing, setListing] = useState<Listing | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);

	const [claiming, setClaiming] = useState(false);

	const [claimError, setClaimError] = useState<string | null>(null);
	const [claimed, setClaimed] = useState(false);
	const [qty, setQty] = useState(1);

	// Drives the hero parallax as the page scrolls over the photo.
	const scrollY = useRef(new Animated.Value(0)).current;
	// Lifts the sticky claim bar into place on first render.
	const barLift = useRef(new Animated.Value(BAR_TRAVEL)).current;

	useEffect(() => {
		Animated.spring(barLift, {
			toValue: 0,
			useNativeDriver: true,
			speed: 14,
			bounciness: 4,
		}).start();
		// The bar carries the primary action, so it must reach its resting place
		// whether or not the spring runs.
		const settle = setTimeout(() => barLift.setValue(0), 600);
		return () => clearTimeout(settle);
	}, [barLift]);

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
			// This is the moment the whole app exists for, and the screen changes
			// out from under it — the toast and the claims list arrive together, so
			// the success pattern is what marks the food as actually yours.
			haptics.success();
			toast.show("Reserved! Confirm pickup within 15 minutes.");
			// Land on the user's claims, where the pickup details live.
			router.replace("/claims");
		} catch (err) {
			// Losing a race for the last portion is the common failure here, and it
			// deserves to feel different from succeeding, not just read differently.
			haptics.error();
			setClaimError(
				err instanceof ApiError ? err.message : "Couldn't claim. Try again.",
			);
		} finally {
			setClaiming(false);
		}
	}

	async function onDirections() {
		if (!listing) return;
		const opened = await openDirections(
			listing.lat,
			listing.lng,
			listing.building,
		);
		if (!opened) {
			// No maps app and no browser to fall back to is rare, but silently
			// doing nothing would read as a dead button.
			haptics.error();
			toast.show("Couldn't open maps on this device.");
		}
	}

	/** Nudge the portion count, within what's actually left (and at most 10). */
	function stepQty(delta: number) {
		if (!listing) return;
		const next = Math.min(
			Math.min(listing.quantity_remaining, 10),
			Math.max(1, qty + delta),
		);
		// A stepper that feels identical at the end of its range as in the middle
		// leaves you pressing a dead control and wondering. The refusal gets its
		// own, blunter pulse.
		if (next === qty) {
			haptics.bump();
			return;
		}
		haptics.select();
		setQty(next);
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
	const remaining = formatDuration(listing.expires_at, now);
	const cover = listing.photo_urls[0];
	const canClaim = listing.is_claimable && !claimed;
	const expiresAt = new Date(listing.expires_at).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["bottom"]}>
			<Animated.ScrollView
				showsVerticalScrollIndicator={false}
				scrollEventThrottle={16}
				onScroll={Animated.event(
					[{ nativeEvent: { contentOffset: { y: scrollY } } }],
					// JS driver: react-native-web has no native driver, and this is a
					// single transform on one element.
					{ useNativeDriver: false },
				)}
			>
				{/* Photo with overlay controls. The image drifts and swells as the
				    page moves over it — it stays static if the interpolation never
				    runs, which costs nothing but the effect. */}
				<View className="relative">
					<Animated.View
						style={{
							transform: [
								{
									translateY: scrollY.interpolate({
										inputRange: [-HERO_HEIGHT, 0, HERO_HEIGHT],
										outputRange: [-HERO_HEIGHT / 2, 0, HERO_HEIGHT * 0.35],
										extrapolate: "clamp",
									}),
								},
								{
									scale: scrollY.interpolate({
										inputRange: [-HERO_HEIGHT, 0],
										outputRange: [1.6, 1],
										extrapolateRight: "clamp",
									}),
								},
							],
						}}
					>
						{cover ? (
							<Image
								source={{ uri: cover }}
								className="w-full bg-gray-100"
								style={{ height: HERO_HEIGHT }}
							/>
						) : (
							<View
								className="w-full bg-forest-50 items-center justify-center"
								style={{ height: HERO_HEIGHT }}
							>
								<Text className="font-display text-forest-300 text-2xl">
									EcoEats
								</Text>
							</View>
						)}
					</Animated.View>

					<Pressable
						onPress={() => router.back()}
						hitSlop={8}
						style={{ top: insets.top + 16 }}
						className="absolute left-4 w-10 h-10 rounded-full bg-white/90 items-center justify-center"
						accessibilityRole="button"
						accessibilityLabel="Go back"
					>
						<Ionicons name="chevron-back" size={22} color="#0C3226" />
					</Pressable>
					<Pressable
						onPress={onShare}
						hitSlop={8}
						style={{ top: insets.top + 16 }}
						className="absolute right-4 w-10 h-10 rounded-full bg-white/90 items-center justify-center"
						accessibilityRole="button"
						accessibilityLabel="Share this listing"
					>
						<Ionicons name="share-outline" size={20} color="#0C3226" />
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
							sub={
								remaining
									? `Expires in ${remaining} (by ${expiresAt})`
									: `Expired at ${expiresAt}`
							}
						/>
						{/* Sits with the address rather than beside the claim button: it
						    answers "where is that?", which is a question you have while
						    still deciding, not after committing. */}
						<View className="mt-3 pt-3 border-t border-gray-100">
							<Button
								variant="outline"
								size="sm"
								haptic="tap"
								onPress={() => void onDirections()}
								accessibilityLabel={`Directions to ${listing.building}`}
								icon={
									<Ionicons name="navigate-outline" size={16} color="#0C3226" />
								}
							>
								Get Directions
							</Button>
						</View>
					</View>

					{/* Shared by */}
					<View className="flex-row items-center gap-3 mt-5 mb-2">
						<View className="w-10 h-10 rounded-full bg-forest-100 items-center justify-center">
							<Ionicons name="person-outline" size={20} color="#0C3226" />
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
			</Animated.ScrollView>

			{/* Sticky claim bar. Rises into place once, so the primary action
			    arrives rather than appearing to have always been there. The styled
			    box is the inner View — NativeWind doesn't process className on
			    animated components, and fails silently when you try. */}
			<Animated.View style={{ transform: [{ translateY: barLift }] }}>
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
							onPress={() => stepQty(-1)}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel="Fewer portions"
						>
							<Ionicons name="remove-circle-outline" size={30} color="#0C3226" />
						</Pressable>
						<Text className="font-display-bold text-xl text-gray-900 w-6 text-center">
							{qty}
						</Text>
						<Pressable
							onPress={() => stepQty(1)}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel="More portions"
						>
							<Ionicons name="add-circle-outline" size={30} color="#0C3226" />
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
			</Animated.View>
		</SafeAreaView>
	);
}
