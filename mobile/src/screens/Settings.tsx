import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
	SettingsGroup,
	SettingsRow,
} from "@/components/ui/SettingsList";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { ApiError, deleteAccount } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import {
	FOOD_SAFETY_DISCLAIMER,
	type LegalDocument,
	PRIVACY,
	TERMS,
} from "@/lib/legal";
import { arePushNotificationsMuted } from "@/lib/pushPreference";

/**
 * Settings: the legal documents, what the app knows about itself, and the two
 * account actions that have to exist.
 *
 * The version is here rather than tucked away because it is the first thing
 * worth knowing in a bug report — "it does X" is far more actionable with the
 * build number attached.
 */
export function Settings() {
	const router = useRouter();
	const confirm = useConfirm();
	const toast = useToast();
	const { signOut, profile, setPushMuted } = useAuth();

	const [reading, setReading] = useState<LegalDocument | null>(null);
	const [muted, setMuted] = useState(false);
	const [deleting, setDeleting] = useState(false);

	useEffect(() => {
		void arePushNotificationsMuted().then(setMuted);
	}, []);

	const version = Constants.expoConfig?.version ?? "unknown";
	// The build number changes on every EAS build even when the version doesn't,
	// so it's what actually identifies which binary someone is running.
	const build =
		Constants.expoConfig?.ios?.buildNumber ??
		Constants.expoConfig?.android?.versionCode?.toString() ??
		"—";

	async function toggleMute(next: boolean) {
		haptics.select();
		// Moved before the await so the switch answers the thumb immediately;
		// handing the token back takes a round trip.
		setMuted(next);
		await setPushMuted(next);
	}

	async function confirmDelete() {
		const ok = await confirm({
			title: "Delete your account?",
			message:
				profile?.role === "organizer"
					? "This removes your profile, your posts and everything on them — including claims other people have made. It cannot be undone."
					: "This removes your profile, your claims and your ratings. It cannot be undone.",
			confirmLabel: "Delete everything",
			cancelLabel: "Keep my account",
		});
		if (!ok) return;

		setDeleting(true);
		try {
			await deleteAccount();
			haptics.success();
			// The account is gone, so there is nothing left to be signed in to.
			// signOut also hands back the push token and clears local state.
			await signOut();
		} catch (err) {
			haptics.error();
			toast.show(
				err instanceof ApiError
					? err.message
					: "Couldn't delete the account. Try again.",
			);
			setDeleting(false);
		}
	}

	if (reading) {
		return (
			<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
				<View className="px-5 pt-2 pb-1">
					<Pressable
						onPress={() => setReading(null)}
						accessibilityRole="button"
						accessibilityLabel="Back to settings"
						hitSlop={10}
						className="flex-row items-center py-2"
					>
						<Ionicons name="chevron-back" size={18} color="#0C3226" />
						<Text className="font-body-medium text-forest-800 ml-1">
							Settings
						</Text>
					</Pressable>
				</View>
				<LegalDocumentView document={reading} />
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top"]}>
			<View className="px-5 pt-2 pb-3 flex-row items-center">
				<Pressable
					onPress={() => router.back()}
					accessibilityRole="button"
					accessibilityLabel="Go back"
					hitSlop={10}
					className="py-2 pr-3"
				>
					<Ionicons name="chevron-back" size={22} color="#0C3226" />
				</Pressable>
				<Text className="font-display-bold text-3xl text-forest-800">
					Settings
				</Text>
			</View>

			<ScrollView
				className="px-5"
				contentContainerStyle={{ paddingBottom: 40 }}
				showsVerticalScrollIndicator={false}
			>
				<SettingsGroup title="Notifications">
					<SettingsRow
						icon="notifications-outline"
						label="Mute notifications"
						subtitle="Stops pushes without touching your iOS permission."
						accessory={
							<Switch
								value={muted}
								onValueChange={(v) => void toggleMute(v)}
								accessibilityLabel="Mute notifications"
							/>
						}
					/>
				</SettingsGroup>

				<SettingsGroup title="Legal">
					<SettingsRow
						icon="document-text-outline"
						label="Terms of use"
						onPress={() => setReading(TERMS)}
					/>
					<SettingsRow
						icon="warning-outline"
						label="Food safety"
						onPress={() => setReading(FOOD_SAFETY_DISCLAIMER)}
					/>
					<SettingsRow
						icon="lock-closed-outline"
						label="Privacy"
						onPress={() => setReading(PRIVACY)}
					/>
				</SettingsGroup>

				<SettingsGroup title="About">
					<SettingsRow icon="phone-portrait-outline" label="Version" detail={version} />
					<SettingsRow icon="hammer-outline" label="Build" detail={build} />
					{profile?.terms_accepted_at && (
						<SettingsRow
							icon="checkmark-circle-outline"
							label="Terms accepted"
							detail={new Date(profile.terms_accepted_at).toLocaleDateString()}
						/>
					)}
				</SettingsGroup>

				<SettingsGroup title="Account">
					<SettingsRow
						icon="log-out-outline"
						label="Sign out"
						onPress={() => void signOut()}
					/>
					<SettingsRow
						icon="trash-outline"
						label="Delete account"
						danger
						onPress={() => void confirmDelete()}
					/>
				</SettingsGroup>

				{deleting && (
					<View className="flex-row items-center justify-center py-2">
						<Spinner />
						<Text className="font-body text-gray-500 ml-2">
							Deleting your account…
						</Text>
					</View>
				)}

				<Text className="font-body text-gray-400 text-xs text-center mt-2 leading-5">
					EcoEats is a student project and is not an official Arizona State
					University service.
				</Text>
			</ScrollView>
		</SafeAreaView>
	);
}
