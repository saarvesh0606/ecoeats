import { Image, Pressable, Text, View } from "react-native";
import {
	formatDistance,
	formatLocation,
	formatTimeLeft,
	urgency,
} from "@/lib/format";
import type { Listing } from "@/lib/listings";

const URGENCY_STYLES: Record<string, string> = {
	high: "bg-red-100 text-red-700",
	medium: "bg-amber-100 text-amber-700",
	low: "bg-forest-100 text-forest-700",
};

interface ListingCardProps {
	listing: Listing;
	now: number;
	onPress: () => void;
}

export function ListingCard({ listing, now, onPress }: ListingCardProps) {
	const timeLeft = formatTimeLeft(listing.expires_at, now);
	const level = urgency(listing.expires_at, now);
	const distance = formatDistance(listing.distance_miles);
	const cover = listing.photo_urls[0];

	return (
		<Pressable
			onPress={onPress}
			className="bg-white rounded-card overflow-hidden border border-gray-100 active:opacity-90"
			accessibilityRole="button"
			accessibilityLabel={`${listing.title}, ${timeLeft}`}
		>
			{cover ? (
				<Image
					source={{ uri: cover }}
					className="w-full h-40 bg-gray-100"
					resizeMode="cover"
				/>
			) : (
				<View className="w-full h-40 bg-forest-50 items-center justify-center">
					<Text className="font-display text-forest-300 text-lg">EcoEats</Text>
				</View>
			)}

			<View className="p-4">
				<View className="flex-row items-start justify-between gap-3">
					<Text
						className="font-display font-bold text-lg text-gray-900 flex-1"
						numberOfLines={1}
					>
						{listing.title}
					</Text>
					<View className={`rounded-full px-2 py-0.5 ${URGENCY_STYLES[level].split(" ")[0]}`}>
						<Text className={`font-body text-xs font-semibold ${URGENCY_STYLES[level].split(" ")[1]}`}>
							{timeLeft}
						</Text>
					</View>
				</View>

				<Text className="font-body text-gray-500 text-sm mt-1" numberOfLines={1}>
					{formatLocation(listing.building, listing.room)}
					{distance ? ` · ${distance}` : ""}
				</Text>

				{listing.dietary_tags.length > 0 && (
					<View className="flex-row flex-wrap gap-1.5 mt-3">
						{listing.dietary_tags.map((tag) => (
							<View key={tag} className="bg-forest-50 rounded-full px-2 py-0.5">
								<Text className="font-body text-xs text-forest-700 capitalize">
									{tag}
								</Text>
							</View>
						))}
					</View>
				)}

				{listing.allergens && (
					<Text className="font-body text-xs text-amber-700 mt-2" numberOfLines={2}>
						⚠ {listing.allergens}
					</Text>
				)}

				<View className="flex-row items-center justify-between mt-3">
					<Text className="font-body text-sm text-gray-600">
						{listing.organizer.name}
					</Text>
					<Text className="font-body text-sm font-semibold text-forest-700">
						{listing.quantity_remaining} left
					</Text>
				</View>
			</View>
		</Pressable>
	);
}
