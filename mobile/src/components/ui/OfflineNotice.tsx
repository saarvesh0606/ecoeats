import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { usePulse } from "@/hooks/usePulse";
import { theme } from "@/hooks/useThemeColors";

/** One breath of the icon. Slow: this is reassurance, not an alarm. */
const BREATH_MS = 2000;

/**
 * Says the phone is offline, and that the app hasn't given up.
 *
 * There is no connectivity library here — both of them are native modules, and
 * everything now reaches the phone as an update — so "offline" is inferred
 * instead: an ApiError means the server answered and objected, and anything
 * else means the request never arrived. Good enough for the only decision being
 * made, which is what to put on the screen.
 *
 * The motion matters more than usual. A static "no internet" page looks like a
 * dead end and invites people to close the app, which is exactly when it can no
 * longer notice the connection returning. Something still breathing says it is
 * still trying — which it is, since the feed retries while this is up.
 */
export function OfflineNotice({
	compact = false,
	onRetry,
}: {
	/** A strip above food already on screen, rather than a whole empty page. */
	compact?: boolean;
	onRetry: () => void;
}) {
	const breath = usePulse(BREATH_MS);

	if (compact) {
		return (
			<View className="mx-5 mb-3 flex-row items-center gap-2 rounded-btn bg-amber-50 border border-amber-200 px-3 py-2">
				<Ionicons
					name="cloud-offline-outline"
					size={16}
					color="#B45309"
					style={{ opacity: 0.55 + breath * 0.45 }}
				/>
				<Text className="font-body text-xs text-amber-800 flex-1">
					You're offline — showing the last food we saw.
				</Text>
			</View>
		);
	}

	return (
		<View className="flex-1 items-center justify-center px-8">
			<Ionicons
				name="cloud-offline-outline"
				size={52}
				color={theme.muted}
				// Scaled as well as faded, so the motion still reads for someone who
				// can't easily separate the two greys.
				style={{
					opacity: 0.5 + breath * 0.5,
					transform: [{ scale: 0.94 + breath * 0.06 }],
				}}
			/>
			<Text className="font-display-bold text-xl text-gray-900 text-center mt-5">
				You're offline
			</Text>
			<Text className="font-body text-gray-500 text-center mt-2">
				Food nearby will appear as soon as you're back. We'll keep checking.
			</Text>
			<View className="mt-6">
				<Button variant="outline" onPress={onRetry}>
					Try again
				</Button>
			</View>
		</View>
	);
}
