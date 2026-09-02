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
import { usePulse } from "@/hooks/usePulse";
import { theme } from "@/hooks/useThemeColors";
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
/** How much of the home-indicator inset the non-tappable caption may sit in. */
const INDICATOR_OVERLAP = 20;

/** Height of the fade that dissolves the page into the claim bar. */
const FADE_HEIGHT = 28;
/** Bands in that fade. Enough to read as a gradient, few enough to be cheap.
    Held as their opacities, which double as stable keys. */
const FADE_ALPHAS = Array.from({ length: 10 }, (_, i) => (i + 1) / 10);
/** Past this much scrolling the hint has done its job and gets out of the way. */
const HINT_FADE_PX = 90;
/** How long the hint stays if nobody scrolls. Long enough to read, then gone. */
const HINT_LIFE_MS = 3800;
/** How long it takes to leave once its time is up. */
const HINT_EXIT_MS = 450;

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
			<Ionicons
				name={icon}
				size={18}
				color={theme.brand}
				style={{ marginTop: 1 }}
			/>
			<View className="flex-1">
				<Text className="font-body-semibold text-gray-900 text-sm">
					{label}
				</Text>
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
	// The claim bar floats over the page, so the page has to be told how much
	// of itself is covered. Its height varies with the portions stepper and the
	// error line, so it is measured rather than guessed.
	const [barHeight, setBarHeight] = useState(0);
	// Gentle bob on the scroll hint. Timer-driven, like every other ambient
	// motion here, so it survives a pane that has stopped painting.
	const hintBob = usePulse(1600);
	// The hint leaves two ways, whichever comes first: scrolled away, or simply
	// timed out. A prompt to scroll that is still sitting there a minute later
	// has stopped being a prompt and become furniture.
	const hintLife = useRef(new Animated.Value(1)).current;
	useEffect(() => {
		const id = setTimeout(() => {
			Animated.timing(hintLife, {
				toValue: 0,
				duration: HINT_EXIT_MS,
				useNativeDriver: false,
			}).start();
		}, HINT_LIFE_MS);
		return () => clearTimeout(id);
	}, [hintLife]);
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

	if (loading) return <Spinner className="flex-1 bg-page" />;

	if (loadError || !listing) {
		return (
			<SafeAreaView className="flex-1 bg-page items-center justify-center px-8">
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
		// The bottom inset belongs to the claim bar alone (see below), so the
		// container must not reserve it as well.
		<SafeAreaView className="flex-1 bg-page" edges={[]}>
			<Animated.ScrollView
				showsVerticalScrollIndicator={false}
				// Enough room to scroll everything out from under the bar.
				contentContainerStyle={{ paddingBottom: barHeight }}
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
						className="absolute left-4 w-10 h-10 rounded-full bg-card/90 items-center justify-center"
						accessibilityRole="button"
						accessibilityLabel="Go back"
					>
						<Ionicons name="chevron-back" size={22} color={theme.brand} />
					</Pressable>
					<Pressable
						onPress={onShare}
						hitSlop={8}
						style={{ top: insets.top + 16 }}
						className="absolute right-4 w-10 h-10 rounded-full bg-card/90 items-center justify-center"
						accessibilityRole="button"
						accessibilityLabel="Share this listing"
					>
						<Ionicons name="share-outline" size={20} color={theme.brand} />
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
					<View className="bg-card rounded-card p-4 border border-gray-100">
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
									<Ionicons
										name="navigate-outline"
										size={16}
										color={theme.brand}
									/>
								}
							>
								Get Directions
							</Button>
						</View>
					</View>

					{/* Shared by */}
					<View className="flex-row items-center gap-3 mt-5 mb-2">
						<View className="w-10 h-10 rounded-full bg-forest-100 items-center justify-center">
							<Ionicons name="person-outline" size={20} color={theme.brand} />
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
										{listing.organizer.rating} ({listing.organizer.rating_count}
										)
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
								Host
							</Text>
						</View>
					</View>
				</View>
			</Animated.ScrollView>

			{/* Sticky claim bar. Rises into place once, so the primary action
			    arrives rather than appearing to have always been there. The styled
			    box is the inner View — NativeWind doesn't process className on
			    animated components, and fails silently when you try. */}
			{/* "There is more down here."
			    The fold lands mid-card on most phones, and the pickup location and
			    the directions button both sit below it — the two things someone
			    opening a listing actually came for. The fade says the page
			    continues; this says what continues, and then leaves.
			    It rides the scroll position rather than a timer, so it is gone by
			    the time it would be in the way, and it never intercepts a touch. */}
			<Animated.View
				pointerEvents="none"
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					bottom: barHeight + FADE_HEIGHT + 4,
					alignItems: "center",
					// Multiplied, so either route alone is enough to hide it.
					opacity: Animated.multiply(
						hintLife,
						scrollY.interpolate({
							inputRange: [0, HINT_FADE_PX],
							outputRange: [1, 0],
							extrapolate: "clamp",
						}),
					),
					transform: [{ translateY: hintBob * 4 }],
				}}
			>
				{/* NativeWind doesn't process className on animated components and
				    fails silently, so the styled box is this inner view. */}
				<View className="flex-row items-center gap-1.5 bg-forest-800 rounded-full px-3 py-1.5">
					<Ionicons name="chevron-down" size={13} color={theme.page} />
					<Text className="font-body-semibold text-xs text-cream">
						Scroll for pickup details
					</Text>
				</View>
			</Animated.View>

			{/* Dissolves the page into the bar instead of cutting it flat.
			    A solid bar butted against scrolling content ends the page at a
			    hard line, which reads as a rendering fault rather than as
			    something to scroll — and a see-through bar solves that but looks
			    muddy without a blur behind it, and expo-blur is native, so it
			    cannot arrive in an update. Stacked bands of increasing opacity
			    give the gradient a real one would, in plain views.
			    ⚠ The colour comes from the theme, not a literal. Hard-coded cream
			    here painted a pale band straight across a dark page — the fade is
			    the page fading, so it has to be whatever the page currently is. */}
			<View
				pointerEvents="none"
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					bottom: barHeight,
					height: FADE_HEIGHT,
				}}
			>
				{FADE_ALPHAS.map((alpha) => (
					<View
						key={alpha}
						style={{
							flex: 1,
							backgroundColor: `rgba(${theme.pageRgb}, ${alpha})`,
						}}
					/>
				))}
			</View>

			<Animated.View
				onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
				style={{
					transform: [{ translateY: barLift }],
					position: "absolute",
					left: 0,
					right: 0,
					bottom: 0,
				}}
			>
				{/* Sits close to the bottom edge on purpose.
			    The home-indicator inset exists to keep *tappable* things out of the
			    swipe-up area, and the full inset was pushing the whole block into
			    the middle of nowhere. The caption under the button is not tappable,
			    so it can occupy that strip quite happily — which leaves the button
			    itself still clear of the gesture area while the group as a whole
			    reaches the bottom of the screen where it belongs.
			    The floor covers older phones, where the inset is zero. */}
				<View
					style={{
						paddingBottom: Math.max(insets.bottom - INDICATOR_OVERLAP, 12),
					}}
					className="px-5 pt-4 border-t border-gray-100 bg-page"
				>
					{claimError && (
						<Text className="font-body text-red-500 text-sm mb-2 text-center">
							{claimError}
						</Text>
					)}
					{/* No label. A minus, a number and a plus directly above a button
				    reading "Claim 3 Portions" is already unambiguous, and the word
				    was the only thing keeping the control off-centre. */}
					{canClaim && listing.quantity_remaining > 1 && (
						<View className="flex-row items-center justify-center gap-5 mb-3">
							<Pressable
								onPress={() => stepQty(-1)}
								hitSlop={8}
								accessibilityRole="button"
								accessibilityLabel="Fewer portions"
							>
								<Ionicons
									name="remove-circle-outline"
									size={30}
									color={theme.brand}
								/>
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
								<Ionicons
									name="add-circle-outline"
									size={30}
									color={theme.brand}
								/>
							</Pressable>
						</View>
					)}
					<Button
						onPress={onClaim}
						loading={claiming}
						disabled={!canClaim}
						size="lg"
					>
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
