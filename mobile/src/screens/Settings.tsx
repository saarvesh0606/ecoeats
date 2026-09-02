import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { SignInMethods } from "@/components/SignInMethods";
import { SettingsGroup, SettingsRow } from "@/components/ui/SettingsList";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { applyColorScheme, theme } from "@/hooks/useThemeColors";
import { ApiError, deleteAccount } from "@/lib/api";
import { applyHapticPreference, haptics } from "@/lib/haptics";
import {
	areHapticsMuted,
	arePushNotificationsMuted,
	getThemeChoice,
	setHapticsMuted,
	setThemeChoice as saveThemeChoice,
	type ThemeChoice,
} from "@/lib/preferences";

/**
 * Settings: the legal documents, what the app knows about itself, and the two
 * account actions that have to exist.
 *
 * The version is here rather than tucked away because it is the first thing
 * worth knowing in a bug report — "it does X" is far more actionable with the
 * build number attached.
 */
const APPEARANCE_OPTIONS: {
	value: ThemeChoice;
	label: string;
	subtitle: string;
	icon: keyof typeof Ionicons.glyphMap;
}[] = [
	{
		value: "system",
		label: "Match my phone",
		subtitle: "Follows your device setting.",
		icon: "phone-portrait-outline",
	},
	{
		value: "light",
		label: "Light",
		subtitle: "Always light.",
		icon: "sunny-outline",
	},
	{
		value: "dark",
		label: "Dark",
		subtitle: "Always dark.",
		icon: "moon-outline",
	},
];

export function Settings() {
	const router = useRouter();
	const confirm = useConfirm();
	const toast = useToast();
	const { signOut, profile, setPushMuted } = useAuth();

	const [muted, setMuted] = useState(false);
	const [hapticsOff, setHapticsOff] = useState(false);
	const [appearance, setAppearance] = useState<ThemeChoice>("system");
	const [deleting, setDeleting] = useState(false);

	useEffect(() => {
		void arePushNotificationsMuted().then(setMuted);
		void areHapticsMuted().then(setHapticsOff);
		void getThemeChoice().then(setAppearance);
	}, []);

	const version = Constants.expoConfig?.version ?? "unknown";
	// The build number changes on every EAS build even when the version doesn't,
	// so it's what actually identifies which binary someone is running.
	const build =
		Constants.expoConfig?.ios?.buildNumber ??
		Constants.expoConfig?.android?.versionCode?.toString() ??
		"—";

	// Which over-the-air update is actually running.
	//
	// Fixes now reach the phone as updates rather than builds, and an update is
	// invisible by design: the app looks identical, so "I don't see the change"
	// can equally mean it never arrived or that it arrived and the change was
	// wrong. Those need opposite responses and there was no way to tell them
	// apart from the outside. isEmbedded means the binary's own bundle, i.e. no
	// update has been applied yet.
	const updateLabel = Updates.isEmbeddedLaunch
		? "Original (no update)"
		: Updates.createdAt
			? Updates.createdAt.toLocaleString()
			: (Updates.updateId?.slice(0, 8) ?? "unknown");
	// The channel the binary listens on. Null here means this build cannot
	// receive updates at all, which is a different fault from one that simply
	// hasn't arrived — and not otherwise distinguishable from the phone.
	const channel = Updates.channel ?? "none";

	// Signing out is a network round trip, and the row gave no sign it had heard
	// the tap — so the natural response was to tap it again. SettingsRow already
	// draws a spinner and refuses further presses when told it is busy; nothing
	// was ever telling it.
	//
	// The flag is only cleared on failure. A sign-out that works unmounts this
	// screen, so clearing it on the way out would be writing to something that
	// is already leaving — and worse, would briefly restore a live-looking
	// button on a screen mid-exit.
	const [signingOut, setSigningOut] = useState(false);
	async function onSignOut() {
		setSigningOut(true);
		try {
			await signOut();
		} catch {
			setSigningOut(false);
		}
	}

	async function chooseAppearance(next: ThemeChoice) {
		haptics.select();
		// Applied before the write, so the screen answers the tap immediately and
		// storage catches up. Failing to persist costs the choice next launch,
		// which is a smaller loss than a row that looks like it didn't register.
		setAppearance(next);
		applyColorScheme(next);
		await saveThemeChoice(next);
	}

	async function toggleMute(next: boolean) {
		haptics.select();
		// Moved before the await so the switch answers the thumb immediately;
		// handing the token back takes a round trip.
		setMuted(next);
		await setPushMuted(next);
	}

	async function toggleHaptics(off: boolean) {
		// Fires before applying, so turning it *off* still gives the tick that
		// confirms the tap landed — the last thing it will do.
		haptics.select();
		setHapticsOff(off);
		applyHapticPreference(off);
		await setHapticsMuted(off);
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

	return (
		<SafeAreaView className="flex-1 bg-page" edges={["top"]}>
			<View className="px-5 pt-2 pb-3 flex-row items-center">
				<Pressable
					onPress={() => router.back()}
					accessibilityRole="button"
					accessibilityLabel="Go back"
					hitSlop={10}
					className="py-2 pr-3"
				>
					<Ionicons name="chevron-back" size={22} color={theme.brand} />
				</Pressable>
				<Text className="font-display-bold text-3xl text-brand">Settings</Text>
			</View>

			<ScrollView
				className="px-5"
				contentContainerStyle={{ paddingBottom: 40 }}
				showsVerticalScrollIndicator={false}
			>
				<SettingsGroup title="Feedback">
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
					<SettingsRow
						icon="pulse-outline"
						label="Haptic feedback"
						subtitle="The small taps you feel when something happens."
						accessory={
							<Switch
								value={!hapticsOff}
								onValueChange={(on) => void toggleHaptics(!on)}
								accessibilityLabel="Haptic feedback"
							/>
						}
					/>
				</SettingsGroup>

				<SignInMethods
					onError={(m) => m && toast.show(m)}
					onLinked={(label) => toast.show(`${label} linked to this account.`)}
				/>

				{/* Three rows rather than one switch: light/dark is two states but
				    the honest default is a third — following the phone — and a
				    switch cannot say "whatever you already decided". */}
				<SettingsGroup title="Appearance">
					{APPEARANCE_OPTIONS.map((option) => (
						<SettingsRow
							key={option.value}
							icon={option.icon}
							label={option.label}
							subtitle={option.subtitle}
							onPress={() => void chooseAppearance(option.value)}
							accessory={
								appearance === option.value ? (
									<Ionicons name="checkmark" size={20} color={theme.brand} />
								) : (
									<View className="w-5" />
								)
							}
						/>
					))}
				</SettingsGroup>

				<SettingsGroup title="Legal">
					<SettingsRow
						icon="document-text-outline"
						label="Terms of use"
						onPress={() =>
							router.push({
								pathname: "/settings/[doc]",
								params: { doc: "terms" },
							})
						}
					/>
					<SettingsRow
						icon="warning-outline"
						label="Food safety"
						onPress={() =>
							router.push({
								pathname: "/settings/[doc]",
								params: { doc: "safety" },
							})
						}
					/>
					<SettingsRow
						icon="lock-closed-outline"
						label="Privacy"
						onPress={() =>
							router.push({
								pathname: "/settings/[doc]",
								params: { doc: "privacy" },
							})
						}
					/>
				</SettingsGroup>

				<SettingsGroup title="About">
					<SettingsRow
						icon="phone-portrait-outline"
						label="Version"
						detail={version}
					/>
					<SettingsRow icon="hammer-outline" label="Build" detail={build} />
					<SettingsRow
						icon="cloud-download-outline"
						label="Update"
						detail={updateLabel}
					/>
					<SettingsRow icon="radio-outline" label="Channel" detail={channel} />
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
						loading={signingOut}
						onPress={() => void onSignOut()}
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
					EcoEats is a student project. It is not an official service of any
					university.
				</Text>
			</ScrollView>
		</SafeAreaView>
	);
}
