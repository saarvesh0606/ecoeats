import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import {
	SettingsGroup,
	SettingsRow,
} from "@/components/ui/SettingsList";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { ApiError, changeRole, updateProfile } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { DIETARY_TAGS } from "@/lib/listings";

/** Where each role's app begins. Switching lands here, because the tab the
 *  user was standing on may not exist for the role they just became. */
const HOME_FOR_ROLE = { organizer: "/posts", recipient: "/feed" } as const;

export function Profile() {
	const { profile, applyProfile, signOut } = useAuth();
	const toast = useToast();
	const confirm = useConfirm();
	const router = useRouter();

	const [name, setName] = useState(profile?.name ?? "");
	const [prefs, setPrefs] = useState<string[]>(profile?.dietary_prefs ?? []);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [switching, setSwitching] = useState(false);
	// Separate from `error`: a refused switch has to be readable next to the
	// button that was refused, not up beside Save where it would look like the
	// name failed to save.
	const [roleError, setRoleError] = useState<string | null>(null);

	const isRecipient = profile?.role === "recipient";
	const nextRole = isRecipient ? "organizer" : "recipient";
	const nextLabel = isRecipient ? "host" : "recipient";

	async function onSwitchRole() {
		const ok = await confirm({
			title: `Switch to a ${nextLabel} account?`,
			message: isRecipient
				? "You'll be able to post surplus food, and you'll stop seeing the food feed. You can switch back whenever you like."
				: "You'll be able to claim food near you, and you'll stop being able to post. You can switch back whenever you like.",
			confirmLabel: `Become a ${nextLabel}`,
			// Reversible, and nothing is deleted — the red treatment would
			// overstate it. The server refuses the switch outright if anything is
			// actually at stake.
			destructive: false,
		});
		if (!ok) return;

		setRoleError(null);
		setSwitching(true);
		try {
			const updated = await changeRole(nextRole);
			applyProfile(updated);
			haptics.success();
			toast.show(`You're now a ${nextLabel}.`);
			// The tab bar rebuilds itself from profile.role, but the route under it
			// does not: a host standing on /profile has no /feed to fall back to.
			// Replace rather than push, so Back can't return to the other role's app.
			router.replace(HOME_FOR_ROLE[updated.role]);
		} catch (err) {
			haptics.error();
			// A 409 here is the server naming what is still outstanding — live
			// posts, or a portion someone reserved. That message is the whole
			// point, so it is surfaced verbatim rather than flattened.
			setRoleError(
				err instanceof ApiError ? err.message : "Couldn't switch. Try again.",
			);
		} finally {
			setSwitching(false);
		}
	}

	const dirty =
		name.trim() !== (profile?.name ?? "") ||
		JSON.stringify([...prefs].sort()) !==
			JSON.stringify([...(profile?.dietary_prefs ?? [])].sort());

	function togglePref(tag: string) {
		haptics.select();
		setSaved(false);
		setPrefs((prev) =>
			prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
		);
	}

	async function onSave() {
		if (!name.trim()) {
			haptics.warning();
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
			haptics.success();
			toast.show("Profile saved.");
		} catch (err) {
			haptics.error();
			setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
				<Text className="font-display-bold text-3xl text-forest-800 mb-4">
					Profile
				</Text>
				<View className="flex-row items-center gap-3 mb-6">
					<Avatar
						name={profile?.name ?? "?"}
						uri={profile?.avatar_url}
						size="lg"
					/>
					<View className="flex-1">
						<Text className="font-display-bold text-lg text-gray-900">
							{profile?.name}
						</Text>
						<Text className="font-body text-gray-500 text-sm">
							{profile?.email}
						</Text>
					</View>
					<View className="bg-maroon-50 rounded-full px-3 py-1">
						<Text className="font-body-semibold text-xs text-maroon">
							{isRecipient ? "Recipient" : "ASU Host"}
						</Text>
					</View>
				</View>

				<Input label="Name" value={name} onChangeText={(t) => { setName(t); setSaved(false); }} />

				{isRecipient && (
					<View className="mb-4">
						<Text className="font-body-semibold text-gray-900 mb-2">
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
										className={`font-body text-sm capitalize rounded-full px-3 py-1.5 border overflow-hidden ${on ? "bg-forest-800 border-forest-800 text-white" : "bg-white border-gray-300 text-gray-700"}`}
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

				<View className="mt-10">
					<SettingsGroup title="Account">
						<SettingsRow
							icon="swap-horizontal-outline"
							label={`Switch to ${nextLabel} account`}
							subtitle={
								isRecipient
									? "You're set up to find and claim food."
									: "You're set up to post surplus food."
							}
							onPress={onSwitchRole}
							loading={switching}
						/>
						<SettingsRow
							icon="settings-outline"
							label="Settings"
							subtitle="Notifications, legal, and your account."
							onPress={() => router.push("/settings")}
						/>
					</SettingsGroup>

					{roleError && (
						<Text className="font-body text-red-500 text-sm -mt-3 mb-4 px-1">
							{roleError}
						</Text>
					)}

					{/* Its own group, away from the two rows that change what the app
					    does — leaving is a different kind of act from configuring. */}
					<SettingsGroup>
						<SettingsRow
							icon="log-out-outline"
							label="Sign out"
							onPress={signOut}
						/>
					</SettingsGroup>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
