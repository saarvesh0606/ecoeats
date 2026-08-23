import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { theme } from "@/hooks/useThemeColors";
import { haptics } from "@/lib/haptics";
import { DIETARY_TAGS } from "@/lib/listings";

/**
 * How long is left. The server caps `max_minutes` at 60, which is also the
 * longest a post can live, so there is no window wider than "Any".
 */
const EXPIRY_CHOICES = [
	{ label: "15m", value: 15 },
	{ label: "30m", value: 30 },
	{ label: "1h", value: 60 },
] as const;

/**
 * How far to walk. Campus errands, so the steps are short — the server accepts
 * up to 50 miles but nothing on this feed is ever that far away.
 */
const DISTANCE_CHOICES = [
	{ label: "0.25 mi", value: 0.25 },
	{ label: "0.5 mi", value: 0.5 },
	{ label: "1 mi", value: 1 },
] as const;

interface ChoiceProps {
	label: string;
	selected: boolean;
	onPress: () => void;
}

function Choice({ label, selected, onPress }: ChoiceProps) {
	return (
		<Pressable
			onPress={() => {
				haptics.select();
				onPress();
			}}
			accessibilityRole="button"
			accessibilityState={{ selected }}
			className={`rounded-full px-4 py-2 border ${selected ? "bg-forest-800 border-forest-800" : "bg-white border-gray-200"}`}
		>
			<Text
				className={`font-body-medium text-sm capitalize ${selected ? "text-white" : "text-gray-600"}`}
			>
				{label}
			</Text>
		</Pressable>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<View className="mb-5">
			<Text className="font-body-semibold text-sm text-gray-900 mb-2.5">
				{title}
			</Text>
			<View className="flex-row flex-wrap gap-2">{children}</View>
		</View>
	);
}

export interface FeedFilterSheetProps {
	visible: boolean;
	onClose: () => void;
	/** Undefined means no limit. */
	maxMinutes: number | undefined;
	onMaxMinutes: (value: number | undefined) => void;
	radiusMiles: number | undefined;
	onRadiusMiles: (value: number | undefined) => void;
	dietary: string[];
	onToggleDietary: (tag: string) => void;
	onClearAll: () => void;
	/** Whether a device fix is available. Distance is hidden without one. */
	hasLocation: boolean;
}

/**
 * The full filter surface, behind the options icon in the search bar.
 *
 * The chip row above the feed stays the fast path — one tap for "expiring soon"
 * or a dietary tag. This is for what a chip can't say: *how* soon, and how far
 * you're willing to walk. Both are applied live rather than behind an "Apply"
 * button, so the count behind the sheet moves as you choose and there is no
 * draft state to get out of step with the feed.
 */
export function FeedFilterSheet({
	visible,
	onClose,
	maxMinutes,
	onMaxMinutes,
	radiusMiles,
	onRadiusMiles,
	dietary,
	onToggleDietary,
	onClearAll,
	hasLocation,
}: FeedFilterSheetProps) {
	return (
		<Modal
			visible={visible}
			transparent
			animationType="slide"
			onRequestClose={onClose}
		>
			<Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
				{/* Swallow taps inside the sheet so they don't dismiss it. */}
				<Pressable
					className="bg-cream rounded-t-3xl"
					onPress={() => {}}
					accessibilityViewIsModal
				>
					<SafeAreaView edges={["bottom"]}>
						<View className="px-5 pt-4">
							<View className="flex-row items-center justify-between mb-4">
								<Text className="font-display-bold text-xl text-brand">
									Filters
								</Text>
								<Pressable
									onPress={onClose}
									hitSlop={8}
									accessibilityRole="button"
									accessibilityLabel="Close filters"
								>
									<Ionicons name="close" size={22} color={theme.secondary} />
								</Pressable>
							</View>

							<ScrollView
								showsVerticalScrollIndicator={false}
								className="max-h-96"
							>
								<Section title="Expiring within">
									<Choice
										label="Any"
										selected={maxMinutes === undefined}
										onPress={() => onMaxMinutes(undefined)}
									/>
									{EXPIRY_CHOICES.map((choice) => (
										<Choice
											key={choice.value}
											label={choice.label}
											selected={maxMinutes === choice.value}
											onPress={() => onMaxMinutes(choice.value)}
										/>
									))}
								</Section>

								{/* Distance needs somewhere to measure from. Without a fix the
								    server rejects a radius outright, so rather than show a
								    control that can only fail, say why it isn't here. */}
								{hasLocation ? (
									<Section title="Within">
										<Choice
											label="Any"
											selected={radiusMiles === undefined}
											onPress={() => onRadiusMiles(undefined)}
										/>
										{DISTANCE_CHOICES.map((choice) => (
											<Choice
												key={choice.value}
												label={choice.label}
												selected={radiusMiles === choice.value}
												onPress={() => onRadiusMiles(choice.value)}
											/>
										))}
									</Section>
								) : (
									<View className="mb-5">
										<Text className="font-body-semibold text-sm text-gray-900 mb-1">
											Within
										</Text>
										<Text className="font-body text-sm text-gray-500">
											Turn on location to filter by how far away food is.
										</Text>
									</View>
								)}

								<Section title="Dietary">
									{DIETARY_TAGS.map((tag) => (
										<Choice
											key={tag}
											label={tag}
											selected={dietary.includes(tag)}
											onPress={() => onToggleDietary(tag)}
										/>
									))}
								</Section>
							</ScrollView>

							<View className="flex-row gap-3 pt-1 pb-2">
								<View className="flex-1">
									<Button variant="outline" onPress={onClearAll}>
										Clear all
									</Button>
								</View>
								<View className="flex-1">
									<Button onPress={onClose}>Show results</Button>
								</View>
							</View>
						</View>
					</SafeAreaView>
				</Pressable>
			</Pressable>
		</Modal>
	);
}
