import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { formatDistance, formatLocation, formatTimeLeft } from "@/lib/format";
import type { Listing } from "@/lib/listings";

interface ListingCardProps {
	listing: Listing;
	now: number;
	onPress: () => void;
	/** Presentational ribbon for the top / most-urgent card. A real "featured"
	 *  flag would be a Phase 2 backend feature. */
	featured?: boolean;
}

export function ListingCard({
	listing,
	now,
	onPress,
	featured = false,
}: ListingCardProps) {
	const timeLeft = formatTimeLeft(listing.expires_at, now);
	const distance = formatDistance(listing.distance_miles);
	const cover = listing.photo_urls[0];
	// Local-only for now; a persisted "saved" list is a Phase 2 backend feature.
	const [saved, setSaved] = useState(false);

	return (
		<Pressable
			onPress={onPress}
			className="bg-white rounded-card overflow-hidden border border-gray-100 active:opacity-95"
			// Not accessibilityRole="button": the card contains its own bookmark
			// button, and a button nested in a button is invalid HTML on web.
			accessibilityLabel={`${listing.title}, ${timeLeft}`}
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

				<View className="absolute top-3 right-3 bg-forest-900 rounded-full px-2.5 py-1">
					<Text className="font-body-semibold text-xs text-white">{timeLeft}</Text>
				</View>

				{distance && (
					<View className="absolute bottom-3 left-3 bg-black/50 rounded-full px-2.5 py-1">
						<Text className="font-body-medium text-xs text-white">{distance}</Text>
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
						onPress={() => setSaved((s) => !s)}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel={saved ? "Remove bookmark" : "Save for later"}
					>
						<Ionicons
							name={saved ? "bookmark" : "bookmark-outline"}
							size={20}
							color={saved ? "#1B4332" : "#9CA3AF"}
						/>
					</Pressable>
				</View>

				<Text className="font-body text-gray-500 text-sm mt-0.5" numberOfLines={1}>
					{formatLocation(listing.building, listing.room)}
				</Text>

				{listing.dietary_tags.length > 0 && (
					<View className="flex-row flex-wrap gap-1.5 mt-3">
						{listing.dietary_tags.map((tag) => (
							<View
								key={tag}
								className="border border-gray-200 rounded-full px-2.5 py-0.5"
							>
								<Text className="font-body text-xs text-gray-600 capitalize">
									{tag}
								</Text>
							</View>
						))}
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
		</Pressable>
	);
}
