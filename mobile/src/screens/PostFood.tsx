import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Accuracy as LocationAccuracy } from "expo-location";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
	Image,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { VoicePanel } from "@/components/VoicePanel";
import { type Coords, useDeviceLocation } from "@/hooks/useDeviceLocation";
import { useSpeech } from "@/hooks/useSpeech";
import { ApiError } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import {
	CAMPUSES,
	createListing,
	DIETARY_TAGS,
	EXPIRY_CHOICES,
} from "@/lib/listings";
import { uploadPhoto } from "@/lib/uploads";

const MAX_PHOTOS = 5;

type ScheduleMode = "now" | "1h" | "3h" | "tomorrow";

const SCHEDULE_OPTIONS: { key: ScheduleMode; label: string }[] = [
	{ key: "now", label: "Now" },
	{ key: "1h", label: "In 1 hour" },
	{ key: "3h", label: "In 3 hours" },
	{ key: "tomorrow", label: "Tomorrow 9am" },
];

function scheduledFor(mode: ScheduleMode): string | null {
	if (mode === "now") return null;
	const d = new Date();
	if (mode === "1h") return new Date(d.getTime() + 3_600_000).toISOString();
	if (mode === "3h") return new Date(d.getTime() + 3 * 3_600_000).toISOString();
	d.setDate(d.getDate() + 1);
	d.setHours(9, 0, 0, 0);
	return d.toISOString();
}

export function PostFood() {
	const router = useRouter();
	const confirm = useConfirm();

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	// Which entry affordance is on screen. Defaults to voice because the spec
	// leads with speaking; typing stays available in both modes.
	const [entryMode, setEntryMode] = useState<"voice" | "manual">("voice");
	const [descriptionSource, setDescriptionSource] = useState<
		"voice" | "manual"
	>("manual");
	const [allergens, setAllergens] = useState("");
	const [tags, setTags] = useState<string[]>([]);
	const [quantity, setQuantity] = useState("");
	const [expiry, setExpiry] = useState<(typeof EXPIRY_CHOICES)[number]>(30);
	const [campus, setCampus] = useState<keyof typeof CAMPUSES>("Tempe");
	const [building, setBuilding] = useState("");
	const [room, setRoom] = useState("");
	const [placement, setPlacement] = useState("");
	const [photos, setPhotos] = useState<string[]>([]);
	const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
	/** Where the food actually is, once the host has pinned it. Null means the
	 *  post falls back to the middle of the chosen campus. */
	const [pinned, setPinned] = useState<Coords | null>(null);

	// Never automatic. A host can post from their office about food two
	// buildings away, so quietly stamping the post with wherever the phone
	// happens to be would send people to the wrong door with confidence.
	const location = useDeviceLocation({
		accuracy: LocationAccuracy.High,
	});

	async function pinCurrentLocation() {
		const next = await location.request();
		if (next) {
			setPinned(next);
			haptics.success();
		} else {
			haptics.error();
		}
	}

	const [uploading, setUploading] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const speech = useSpeech((text) => {
		setDescription((prev) => (prev ? `${prev} ${text}` : text));
		setDescriptionSource("voice");
	});

	function toggleTag(tag: string) {
		haptics.select();
		setTags((prev) =>
			prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
		);
	}

	async function addPhoto() {
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ["images"],
			quality: 0.8,
		});
		if (result.canceled || result.assets.length === 0) return;

		setUploading(true);
		setError(null);
		try {
			const url = await uploadPhoto(result.assets[0].uri);
			setPhotos((prev) => [...prev, url]);
			haptics.success();
		} catch {
			haptics.error();
			setError("The photo couldn't be uploaded. Try again.");
		} finally {
			setUploading(false);
		}
	}

	/**
	 * Take a photo back off the post.
	 *
	 * The uploaded file itself is left where it is. Nothing else references it,
	 * and an orphan in Cloudinary is a far smaller problem than a post that
	 * ships with a photo the host tried to remove because a delete call failed.
	 */
	function removePhoto(url: string) {
		haptics.select();
		setPhotos((prev) => prev.filter((p) => p !== url));
	}

	/** Anything worth warning about before wiping the form. */
	const dirty =
		title !== "" ||
		description !== "" ||
		allergens !== "" ||
		quantity !== "" ||
		building !== "" ||
		room !== "" ||
		placement !== "" ||
		tags.length > 0 ||
		photos.length > 0 ||
		pinned !== null ||
		scheduleMode !== "now" ||
		campus !== "Tempe" ||
		expiry !== 30;

	function clearForm() {
		setTitle("");
		setDescription("");
		setEntryMode("voice");
		setDescriptionSource("manual");
		setAllergens("");
		setTags([]);
		setQuantity("");
		setExpiry(30);
		setCampus("Tempe");
		setBuilding("");
		setRoom("");
		setPlacement("");
		setPhotos([]);
		setPinned(null);
		setScheduleMode("now");
		setError(null);
		haptics.success();
	}

	/**
	 * Confirm before discarding. This form is long enough that losing it to a
	 * stray tap would be worse than the extra step — and there is no draft of
	 * it anywhere until the host actually saves one.
	 */
	async function confirmClear() {
		const ok = await confirm({
			title: "Clear this post?",
			message: "Everything you have entered will be discarded.",
			confirmLabel: "Clear",
			cancelLabel: "Keep editing",
		});
		if (ok) clearForm();
	}

	function validate(): string | null {
		if (!title.trim()) return "Give the food a short title.";
		if (!description.trim()) return "Describe the food.";
		const q = Number(quantity);
		if (!Number.isInteger(q) || q < 1) return "How many people does it feed?";
		if (!building.trim()) return "Which building is it in?";
		return null;
	}

	async function submit(publish: "now" | "draft" | "scheduled") {
		const problem = validate();
		if (problem) {
			// The message appears above the button, which on a long form can be off
			// screen; a warning at least says the press did something.
			haptics.warning();
			setError(problem);
			return;
		}
		setError(null);
		setSubmitting(true);
		try {
			await createListing({
				title: title.trim(),
				description: description.trim(),
				description_source: descriptionSource,
				allergens: allergens.trim() || null,
				dietary_tags: tags,
				quantity_total: Number(quantity),
				expiry_minutes: expiry,
				location: {
					campus,
					building: building.trim(),
					room: room.trim() || null,
					placement_note: placement.trim() || null,
					// The pin when there is one, the campus centre otherwise. The
					// fallback is what every post used to send, and it is why feed
					// distances have never meant anything.
					...(pinned ?? CAMPUSES[campus]),
				},
				photo_urls: photos,
				publish,
				scheduled_for:
					publish === "scheduled" ? scheduledFor(scheduleMode) : null,
			});
			haptics.success();
			router.replace("/posts");
		} catch (err) {
			haptics.error();
			setError(
				err instanceof ApiError ? err.message : "Couldn't post. Try again.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<KeyboardAvoidingView
				className="flex-1"
				behavior={Platform.OS === "ios" ? "padding" : undefined}
			>
				<View className="px-5 pt-2 pb-3 flex-row items-start justify-between">
					<View className="flex-1">
						<Text className="font-display-bold text-3xl text-brand">
							Create a Post
						</Text>
						<Text className="font-body text-gray-500 mt-0.5">
							Share surplus food with the ASU community.
						</Text>
					</View>
					{/* Only once there is something to lose — on an empty form this
					    would be a control that does nothing. */}
					{dirty && (
						<Pressable
							onPress={() => void confirmClear()}
							accessibilityRole="button"
							accessibilityLabel="Clear this post"
							hitSlop={8}
							className="pt-2 pl-3"
						>
							<Text className="font-body-medium text-sm text-brand">Clear</Text>
						</Pressable>
					)}
				</View>

				<ScrollView
					className="px-5"
					contentContainerStyle={{ paddingBottom: 24 }}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
				>
					{/* Photos */}
					<Text className="font-body-semibold text-gray-900 mb-2">Photos</Text>
					<View className="flex-row flex-wrap gap-2 mb-4">
						{photos.map((url) => (
							<View key={url} className="w-20 h-20">
								<Image
									source={{ uri: url }}
									className="w-20 h-20 rounded-btn bg-gray-100"
								/>
								{/* The dot stays small so it doesn't cover the photo it
								    belongs to; hitSlop is what makes it tappable. */}
								<Pressable
									onPress={() => removePhoto(url)}
									accessibilityRole="button"
									accessibilityLabel="Remove photo"
									hitSlop={12}
									className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-forest-800 items-center justify-center"
								>
									<Ionicons name="close" size={14} color="#FFFFFF" />
								</Pressable>
							</View>
						))}
						{photos.length < MAX_PHOTOS && (
							<Pressable
								onPress={addPhoto}
								disabled={uploading}
								className="w-20 h-20 rounded-btn border-2 border-dashed border-forest-300 items-center justify-center bg-white"
							>
								<Text className="font-body text-brand text-xs">
									{uploading ? "…" : "+ Add"}
								</Text>
							</Pressable>
						)}
					</View>

					<Input
						label="Title"
						placeholder="e.g. Leftover pizza"
						value={title}
						onChangeText={setTitle}
					/>

					{/* Description — spoken or typed */}
					<View className="mb-4">
						<Text className="font-body-semibold text-gray-900 mb-2">
							Description
						</Text>

						{/* Entry-mode toggle. Only offered where speech actually works;
						    elsewhere the form is simply the typed one. */}
						{speech.supported && (
							<View className="flex-row bg-gray-100 rounded-btn p-1 mb-3">
								{(["voice", "manual"] as const).map((mode) => {
									const on = entryMode === mode;
									return (
										<Pressable
											key={mode}
											onPress={() => {
												haptics.select();
												if (speech.listening) speech.stop();
												setEntryMode(mode);
											}}
											className={`flex-1 rounded-btn py-2 ${on ? "bg-forest-700" : ""}`}
											accessibilityRole="button"
											accessibilityState={{ selected: on }}
										>
											<Text
												className={`font-body-semibold text-sm text-center ${on ? "text-white" : "text-gray-600"}`}
											>
												{mode === "voice" ? "Voice Entry" : "Manual Entry"}
											</Text>
										</Pressable>
									);
								})}
							</View>
						)}

						{speech.supported && entryMode === "voice" && (
							<View className="mb-3">
								<VoicePanel
									listening={speech.listening}
									onToggle={() =>
										speech.listening ? speech.stop() : speech.start()
									}
									error={speech.error}
								/>
							</View>
						)}

						<Input
							placeholder={
								entryMode === "voice" && speech.supported
									? "What you say appears here — you can edit it."
									: "What is it? Describe the food."
							}
							value={description}
							onChangeText={(text) => {
								setDescription(text);
								setDescriptionSource("manual");
							}}
							multiline
							numberOfLines={3}
							className="mb-0"
							style={{ minHeight: 72, textAlignVertical: "top" }}
						/>
						{speech.error && !speech.supported && (
							<Text className="font-body text-xs text-red-500 mt-1">
								{speech.error}
							</Text>
						)}
					</View>

					<Input
						label="Allergens & ingredients"
						placeholder="e.g. Contains gluten, dairy. Made near nuts."
						value={allergens}
						onChangeText={setAllergens}
						multiline
						style={{ minHeight: 56, textAlignVertical: "top" }}
					/>

					{/* Dietary tags */}
					<Text className="font-body-semibold text-gray-900 mb-2">
						Dietary tags
					</Text>
					<View className="flex-row flex-wrap gap-2 mb-4">
						{DIETARY_TAGS.map((tag) => {
							const on = tags.includes(tag);
							return (
								<Pressable
									key={tag}
									onPress={() => toggleTag(tag)}
									className={`rounded-full px-3 py-1.5 border ${on ? "bg-forest-800 border-forest-800" : "bg-white border-gray-300"}`}
								>
									<Text
										className={`font-body text-sm capitalize ${on ? "text-white" : "text-gray-700"}`}
									>
										{tag}
									</Text>
								</Pressable>
							);
						})}
					</View>

					<Input
						label="Feeds how many?"
						placeholder="e.g. 15"
						value={quantity}
						onChangeText={setQuantity}
						keyboardType="number-pad"
					/>

					{/* Expiry */}
					<Text className="font-body-semibold text-gray-900 mb-2">
						Available for
					</Text>
					<View className="flex-row gap-2 mb-4">
						{EXPIRY_CHOICES.map((mins) => {
							const on = expiry === mins;
							return (
								<Pressable
									key={mins}
									onPress={() => {
										haptics.select();
										setExpiry(mins);
									}}
									className={`flex-1 rounded-btn py-2.5 items-center border ${on ? "bg-forest-800 border-forest-800" : "bg-white border-gray-300"}`}
								>
									<Text
										className={`font-body text-sm font-semibold ${on ? "text-white" : "text-gray-700"}`}
									>
										{mins}m
									</Text>
								</Pressable>
							);
						})}
					</View>

					{/* Campus */}
					<Text className="font-body-semibold text-gray-900 mb-2">Campus</Text>
					<View className="flex-row flex-wrap gap-2 mb-4">
						{Object.keys(CAMPUSES).map((name) => {
							const on = campus === name;
							return (
								<Pressable
									key={name}
									onPress={() => {
										haptics.select();
										setCampus(name);
									}}
									className={`rounded-full px-3 py-1.5 border ${on ? "bg-forest-800 border-forest-800" : "bg-white border-gray-300"}`}
								>
									<Text
										className={`font-body text-sm ${on ? "text-white" : "text-gray-700"}`}
									>
										{name}
									</Text>
								</Pressable>
							);
						})}
					</View>

					<Input
						label="Building"
						placeholder="e.g. Wrigley Hall"
						value={building}
						onChangeText={setBuilding}
					/>
					<Input
						label="Room (optional)"
						placeholder="e.g. 205"
						value={room}
						onChangeText={setRoom}
					/>
					<Input
						label="Where exactly (optional)"
						placeholder="e.g. On the table by the window"
						value={placement}
						onChangeText={setPlacement}
					/>

					{/* Pinning is what makes "0.4 mi away" mean anything on the feed.
					    Without it the post lands at the middle of the campus. */}
					<View className="mb-4">
						<Button
							variant={pinned ? "secondary" : "outline"}
							size="sm"
							haptic="tap"
							loading={location.status === "locating"}
							onPress={() => void pinCurrentLocation()}
						>
							{pinned ? "Location pinned — tap to update" : "Pin my location"}
						</Button>
						<Text className="font-body text-gray-400 text-xs mt-1.5">
							{pinned
								? "People will be told how far they are from here."
								: location.status === "denied"
									? `Location permission is off, so this posts at the centre of ${campus}.`
									: location.status === "unavailable"
										? `Couldn't get a location, so this posts at the centre of ${campus}.`
										: `Optional. Without it, this posts at the centre of ${campus}.`}
						</Text>
					</View>

					<Text className="font-body-semibold text-gray-900 mb-2">
						When to publish
					</Text>
					<View className="flex-row flex-wrap gap-2 mb-4">
						{SCHEDULE_OPTIONS.map(({ key, label }) => {
							const on = scheduleMode === key;
							return (
								<Pressable
									key={key}
									onPress={() => {
										haptics.select();
										setScheduleMode(key);
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

					{error && (
						<Text className="font-body text-red-500 text-sm mb-3">{error}</Text>
					)}

					<Button
						onPress={() => submit(scheduleMode === "now" ? "now" : "scheduled")}
						loading={submitting}
						size="lg"
					>
						{scheduleMode === "now" ? "Publish Post" : "Schedule Post"}
					</Button>
					<View className="h-3" />
					<Button onPress={() => submit("draft")} variant="outline">
						Save as Draft
					</Button>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
