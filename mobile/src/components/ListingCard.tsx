import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { PressableScale } from "@/components/ui/PressableScale";
import { formatDistance, formatLocation, formatTimeLeft } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { type Listing, saveListing, unsaveListing } from "@/lib/listings";

interface ListingCardProps {
	listing: Listing;
	now: number;
	onPress: () => void;
	/** Presentational ribbon for the top / most-urgent card. A real "featured"
	 *  flag would be a Phase 2 backend feature. */
	featured?: boolean;
	/** The viewer's dietary preferences, for marking the tags that match. */
	prefs?: readonly string[];
}

/** Under this, the countdown turns red and pulses — the food is about to go. */
const URGENT_SECONDS = 5 * 60;

/**
 * At or below this the supply is the thing to hurry for, not the clock, so the
 * count escalates the same way the countdown does.
 */
const LOW_STOCK = 3;

/**
 * The card is tappable, and a screen reader has to say so — without a role it
 * is announced as plain text and there is nothing to tell you the whole card
 * opens the listing.
 *
 * ⚠️ Withheld on web ONLY, and for one specific reason: the card holds its own
 * bookmark button, and react-native-web turns this role into a real `<button>`
 * element, so declaring it there nests a button inside a button — invalid HTML,
 * and the inner control can become unreachable. Native has no such rule: a row
 * with a secondary action is the ordinary iOS/Android list pattern and both
 * VoiceOver and TalkBack expose the two as separate focusable elements.
 *
 * So this is deliberately NOT symmetric. The earlier code dropped the role on
 * every platform to satisfy the web constraint, which quietly spent native
 * accessibility — the shipping target's accessibility — on a web-only problem.
 */
const CARD_ROLE = Platform.OS === "web" ? undefined : ("button" as const);

export function ListingCard({
	listing,
	now,
	onPress,
	featured = false,
	prefs,
}: ListingCardProps) {
	const timeLeft = formatTimeLeft(listing.expires_at, now);
	const distance = formatDistance(listing.distance_miles);
	const cover = listing.photo_urls[0];
	const [saved, setSaved] = useState(listing.is_saved);

	async function toggleSave() {
		const next = !saved;
		setSaved(next); // optimistic — the server call is idempotent
		haptics.select();
		try {
			if (next) await saveListing(listing.id);
			else await unsaveListing(listing.id);
		} catch {
			setSaved(!next); // put it back if the request failed
			// The bookmark silently flipping back is easy to miss mid-scroll; this
			// is the only thing that tells you the save didn't take.
			haptics.error();
		}
	}

	const urgent = listing.seconds_remaining <= URGENT_SECONDS;
	const scarce = listing.quantity_remaining <= LOW_STOCK;
	// "portions", not "left": formatTimeLeft already renders "30m left", and two
	// chips ending in the same word read as a pair of times — especially aloud,
	// where the label would run "30m left, 8 left".
	const portions = `${listing.quantity_remaining} portion${
		listing.quantity_remaining === 1 ? "" : "s"
	}`;

	return (
		<PressableScale
			onPress={onPress}
			className="bg-white rounded-card overflow-hidden border border-gray-100"
			accessibilityRole={CARD_ROLE}
			accessibilityLabel={`${listing.title}, ${timeLeft}, ${portions}`}
			accessibilityHint="Opens the listing"
		>
			<View className="relative">
				{cover ? (
					<Image
						source={{ uri: cover }}
						className="w-full h-48 bg-gray-100"
						resizeMode="cover"
					/>
				) : (
					<View className="w-full h-48 bg-forest-50 items-center justify-center">
						<Text className="font-display text-forest-300 text-lg">EcoEats</Text>
					</View>
				)}

				{featured && (
					<View className="absolute top-3 left-3 bg-forest-700 rounded-full px-2.5 py-1">
						<Text className="font-body-semibold text-[10px] tracking-wide text-white">
							FEATURED
						</Text>
					</View>
				)}

				<View
					className={`absolute top-3 right-3 rounded-full px-2.5 py-1 ${urgent ? "bg-red-600" : "bg-forest-900"}`}
				>
					<Text className="font-body-semibold text-xs text-white">{timeLeft}</Text>
				</View>

				{distance && (
					<View className="absolute bottom-3 left-3 bg-black/50 rounded-full px-2.5 py-1">
						<Text className="font-body-medium text-xs text-white">{distance}</Text>
					</View>
				)}

				{/* What's left, live. The feed already receives quantity over SSE, but
				    with no number on the card a claim made elsewhere could only show
				    as the card silently vanishing — the supply running down, which is
				    the thing worth watching, was invisible until it hit zero. */}
				{listing.quantity_remaining > 0 && (
					<View
						className={`absolute bottom-3 right-3 rounded-full px-2.5 py-1 ${scarce ? "bg-red-600" : "bg-black/50"}`}
					>
						<Text className="font-body-medium text-xs text-white">{portions}</Text>
					</View>
				)}
			</View>

			<View className="p-4">
				<View className="flex-row items-start justify-between gap-3">
					<Text
						className="font-display-bold text-lg text-gray-900 flex-1"
						numberOfLines={1}
					>
						{listing.title}
					</Text>
					<Pressable
						onPress={toggleSave}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel={saved ? "Remove bookmark" : "Save for later"}
					>
						<Ionicons
							name={saved ? "bookmark" : "bookmark-outline"}
							size={20}
							color={saved ? "#0C3226" : "#9CA3AF"}
						/>
					</Pressable>
				</View>

				<Text className="font-body text-gray-500 text-sm mt-0.5" numberOfLines={1}>
					{formatLocation(listing.building, listing.room)}
				</Text>

				{/* Tags matching the viewer's dietary preferences are filled in
				    rather than outlined. Profile has always promised this — "used to
				    highlight food that fits, you'll still see everything" — and
				    nothing had ever read the setting, so the toggles did nothing at
				    all. Marking rather than filtering is the promise as written, and
				    the safer reading: food here expires within the hour, and hiding
				    it from someone over a preference they set once is a worse
				    failure than showing them something they scroll past. */}
				{listing.dietary_tags.length > 0 && (
					<View className="flex-row flex-wrap gap-1.5 mt-3">
						{listing.dietary_tags.map((tag) => {
							const matches = prefs?.includes(tag) ?? false;
							return (
								<View
									key={tag}
									className={
										matches
											? "border border-forest-600 bg-forest-50 rounded-full px-2.5 py-0.5"
											: "border border-gray-200 rounded-full px-2.5 py-0.5"
									}
								>
									<Text
										// Colour alone would leave this invisible to a screen
										// reader, and to anyone who can't separate the two greens.
										accessibilityLabel={
											matches ? `${tag}, matches your preferences` : tag
										}
										className={
											matches
												? "font-body-semibold text-xs text-forest-800 capitalize"
												: "font-body text-xs text-gray-600 capitalize"
										}
									>
										{tag}
									</Text>
								</View>
							);
						})}
					</View>
				)}

				{listing.allergens && (
					<Text
						className="font-body text-xs text-amber-700 mt-2"
						numberOfLines={2}
					>
						⚠ {listing.allergens}
					</Text>
				)}
			</View>
		</PressableScale>
	);
}
