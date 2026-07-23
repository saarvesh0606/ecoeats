import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
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
import { Input } from "@/components/ui/Input";
import { useSpeech } from "@/hooks/useSpeech";
import { ApiError } from "@/lib/api";
import {
	CAMPUSES,
	createListing,
	DIETARY_TAGS,
	EXPIRY_CHOICES,
} from "@/lib/listings";
import { uploadPhoto } from "@/lib/uploads";

const MAX_PHOTOS = 5;

export default function PostScreen() {
	const router = useRouter();

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [descriptionSource, setDescriptionSource] = useState<"voice" | "manual">(
		"manual",
	);
	const [allergens, setAllergens] = useState("");
	const [tags, setTags] = useState<string[]>([]);
	const [quantity, setQuantity] = useState("");
	const [expiry, setExpiry] = useState<(typeof EXPIRY_CHOICES)[number]>(30);
	const [campus, setCampus] = useState<keyof typeof CAMPUSES>("Tempe");
	const [building, setBuilding] = useState("");
	const [room, setRoom] = useState("");
	const [placement, setPlacement] = useState("");
	const [photos, setPhotos] = useState<string[]>([]);

	const [uploading, setUploading] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const speech = useSpeech((text) => {
		setDescription((prev) => (prev ? `${prev} ${text}` : text));
		setDescriptionSource("voice");
	});

	function toggleTag(tag: string) {
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
		} catch {
			setError("The photo couldn't be uploaded. Try again.");
		} finally {
			setUploading(false);
		}
	}

	function validate(): string | null {
		if (!title.trim()) return "Give the food a short title.";
		if (!description.trim()) return "Describe the food.";
		const q = Number(quantity);
		if (!Number.isInteger(q) || q < 1) return "How many people does it feed?";
		if (!building.trim()) return "Which building is it in?";
		return null;
	}

	async function onSubmit() {
		const problem = validate();
		if (problem) {
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
					...CAMPUSES[campus],
				},
				photo_urls: photos,
			});
			router.replace("/home");
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Couldn't post. Try again.");
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
				<View className="px-5 pt-2 pb-3 flex-row items-center justify-between">
					<Text className="font-display font-bold text-2xl text-gray-900">
						Post food
					</Text>
					<Text
						onPress={() => router.replace("/home")}
						className="font-body text-gray-400"
						accessibilityRole="button"
					>
						Cancel
					</Text>
				</View>

				<ScrollView
					className="px-5"
					contentContainerStyle={{ paddingBottom: 24 }}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
				>
					{/* Photos */}
					<Text className="font-body font-medium text-gray-700 mb-2">Photos</Text>
					<View className="flex-row flex-wrap gap-2 mb-4">
						{photos.map((url) => (
							<Image
								key={url}
								source={{ uri: url }}
								className="w-20 h-20 rounded-btn bg-gray-100"
							/>
						))}
						{photos.length < MAX_PHOTOS && (
							<Pressable
								onPress={addPhoto}
								disabled={uploading}
								className="w-20 h-20 rounded-btn border-2 border-dashed border-forest-300 items-center justify-center bg-white"
							>
								<Text className="font-body text-forest-600 text-xs">
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

					{/* Description with voice */}
					<View className="mb-4">
						<View className="flex-row items-center justify-between mb-1">
							<Text className="text-sm font-body font-medium text-gray-700">
								Description
							</Text>
							{speech.supported && (
								<Pressable
									onPress={() => (speech.listening ? speech.stop() : speech.start())}
									className={`rounded-full px-3 py-1 ${speech.listening ? "bg-red-100" : "bg-forest-50"}`}
								>
									<Text
										className={`font-body text-xs font-semibold ${speech.listening ? "text-red-700" : "text-forest-700"}`}
									>
										{speech.listening ? "● Listening… tap to stop" : "🎤 Speak"}
									</Text>
								</Pressable>
							)}
						</View>
						<Input
							placeholder="What is it? Say it out loud or type."
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
						{speech.error && (
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
					<Text className="font-body font-medium text-gray-700 mb-2">
						Dietary tags
					</Text>
					<View className="flex-row flex-wrap gap-2 mb-4">
						{DIETARY_TAGS.map((tag) => {
							const on = tags.includes(tag);
							return (
								<Pressable
									key={tag}
									onPress={() => toggleTag(tag)}
									className={`rounded-full px-3 py-1.5 border ${on ? "bg-forest-700 border-forest-700" : "bg-white border-gray-300"}`}
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
					<Text className="font-body font-medium text-gray-700 mb-2">
						Available for
					</Text>
					<View className="flex-row gap-2 mb-4">
						{EXPIRY_CHOICES.map((mins) => {
							const on = expiry === mins;
							return (
								<Pressable
									key={mins}
									onPress={() => setExpiry(mins)}
									className={`flex-1 rounded-btn py-2.5 items-center border ${on ? "bg-forest-700 border-forest-700" : "bg-white border-gray-300"}`}
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
					<Text className="font-body font-medium text-gray-700 mb-2">Campus</Text>
					<View className="flex-row flex-wrap gap-2 mb-4">
						{Object.keys(CAMPUSES).map((name) => {
							const on = campus === name;
							return (
								<Pressable
									key={name}
									onPress={() => setCampus(name)}
									className={`rounded-full px-3 py-1.5 border ${on ? "bg-forest-700 border-forest-700" : "bg-white border-gray-300"}`}
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

					{error && (
						<Text className="font-body text-red-500 text-sm mb-3">{error}</Text>
					)}

					<Button onPress={onSubmit} loading={submitting} size="lg">
						Post food
					</Button>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
