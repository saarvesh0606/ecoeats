import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { theme } from "@/hooks/useThemeColors";
import { haptics } from "@/lib/haptics";
import {
	type BlockedUser,
	fetchBlockedUsers,
	unblockUser,
} from "@/lib/moderation";

/**
 * Who you have blocked, and the way back.
 *
 * A block with no undo is a trap, and both the terms and the block dialog
 * promise this screen by name — so it exists for the same reason the block
 * does. It lists only blocks you made: being blocked by somebody is not shown,
 * because a block is meant to be a quiet exit rather than a confrontation.
 */
export function BlockedAccounts() {
	const router = useRouter();
	const toast = useToast();

	const [rows, setRows] = useState<BlockedUser[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [working, setWorking] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setError(null);
			setRows(await fetchBlockedUsers());
		} catch {
			setError("Couldn't load your blocked accounts.");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function unblock(row: BlockedUser) {
		setWorking(row.user_id);
		try {
			await unblockUser(row.user_id);
			haptics.success();
			// Dropped locally rather than refetched: the row is gone either way,
			// and a round trip here would leave it sitting there looking stuck.
			setRows((prev) =>
				(prev ?? []).filter((other) => other.user_id !== row.user_id),
			);
			toast.show(`Unblocked ${row.display_name ?? "that account"}.`);
		} catch {
			haptics.error();
			toast.show("Couldn't unblock. Check your connection.");
		} finally {
			setWorking(null);
		}
	}

	return (
		<SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
			<View className="flex-row items-center gap-3 px-5 pt-2 pb-3">
				<Pressable
					onPress={() => router.back()}
					hitSlop={10}
					accessibilityRole="button"
					accessibilityLabel="Back"
				>
					<Ionicons name="chevron-back" size={24} color={theme.brand} />
				</Pressable>
				<Text className="font-display-bold text-2xl text-brand">
					Blocked accounts
				</Text>
			</View>

			<ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4 }}>
				<Text className="font-body text-gray-500 mb-5">
					You won't see food from anyone here, and they won't see yours.
				</Text>

				{error && (
					<View className="items-start gap-3">
						<Text className="font-body text-red-500">{error}</Text>
						<Button variant="outline" onPress={() => void load()}>
							Try again
						</Button>
					</View>
				)}

				{!error && rows === null && (
					<View className="py-10 items-center">
						<Spinner />
					</View>
				)}

				{!error && rows?.length === 0 && (
					<Text className="font-body text-gray-400">
						You haven't blocked anyone.
					</Text>
				)}

				<View className="gap-2">
					{rows?.map((row) => (
						<View
							key={row.user_id}
							className="flex-row items-center gap-3 rounded-card bg-card border border-gray-100 px-4 py-3"
						>
							<View className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center">
								<Ionicons name="person-outline" size={18} color={theme.muted} />
							</View>
							<Text className="font-body-semibold text-gray-900 flex-1">
								{row.display_name ?? "Deleted account"}
							</Text>
							<Button
								variant="outline"
								size="sm"
								loading={working === row.user_id}
								onPress={() => void unblock(row)}
							>
								Unblock
							</Button>
						</View>
					))}
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
