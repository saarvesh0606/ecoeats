import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/context/AuthContext";
import { ApiError, updateProfile } from "@/lib/api";
import { DIETARY_TAGS } from "@/lib/listings";

export function Profile() {
	const { profile, applyProfile, signOut } = useAuth();

	const [name, setName] = useState(profile?.name ?? "");
	const [prefs, setPrefs] = useState<string[]>(profile?.dietary_prefs ?? []);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isRecipient = profile?.role === "recipient";

	const dirty =
		name.trim() !== (profile?.name ?? "") ||
		JSON.stringify([...prefs].sort()) !==
			JSON.stringify([...(profile?.dietary_prefs ?? [])].sort());

	function togglePref(tag: string) {
		setSaved(false);
		setPrefs((prev) =>
			prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
		);
	}

	async function onSave() {
		if (!name.trim()) {
			setError("Name can't be empty.");
			return;
		}
		setError(null);
		setSaving(true);
		try {
			const updated = await updateProfile({
				name: name.trim(),
				dietary_prefs: isRecipient ? prefs : undefined,
			});
			applyProfile(updated);
			setSaved(true);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
				<Text className="font-display font-bold text-2xl text-gray-900 mb-1">
					Profile
				</Text>
				<Text className="font-body text-gray-500 mb-6 capitalize">
					{profile?.role} · {profile?.email}
				</Text>

				<Input label="Name" value={name} onChangeText={(t) => { setName(t); setSaved(false); }} />

				{isRecipient && (
					<View className="mb-4">
						<Text className="text-sm font-body font-medium text-gray-700 mb-2">
							Dietary preferences
						</Text>
						<Text className="font-body text-gray-400 text-xs mb-2">
							Used to highlight food that fits — you'll still see everything.
						</Text>
						<View className="flex-row flex-wrap gap-2">
							{DIETARY_TAGS.map((tag) => {
								const on = prefs.includes(tag);
								return (
									<Text
										key={tag}
										onPress={() => togglePref(tag)}
										accessibilityRole="button"
										className={`font-body text-sm capitalize rounded-full px-3 py-1.5 border overflow-hidden ${on ? "bg-forest-700 border-forest-700 text-white" : "bg-white border-gray-300 text-gray-700"}`}
									>
										{tag}
									</Text>
								);
							})}
						</View>
					</View>
				)}

				{error && (
					<Text className="font-body text-red-500 text-sm mb-3">{error}</Text>
				)}
				{saved && !dirty && (
					<Text className="font-body text-forest-600 text-sm mb-3">Saved.</Text>
				)}

				<Button onPress={onSave} loading={saving} disabled={!dirty} size="lg">
					Save changes
				</Button>

				<View className="mt-10 pt-6 border-t border-gray-200">
					<Button variant="outline" onPress={signOut}>
						Sign out
					</Button>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
