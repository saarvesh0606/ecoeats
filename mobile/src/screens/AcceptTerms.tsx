import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { ApiError, acceptTerms } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { FOOD_SAFETY_DISCLAIMER, TERMS } from "@/lib/legal";

type Tab = "terms" | "safety";

/**
 * The one screen nobody gets past without agreeing.
 *
 * Shown after the profile exists — so acceptance is recorded against a real
 * account — and before the app proper. There is deliberately no skip and no
 * back: the router sends anyone in `needs-terms` straight back here, so a
 * dismiss button would only ever loop.
 *
 * The food safety disclaimer sits alongside the terms rather than buried in a
 * link. It is the part that actually matters for a food app, and a link is a
 * thing people do not open.
 */
export function AcceptTerms() {
	const { completeTerms, signOut } = useAuth();
	const [tab, setTab] = useState<Tab>("terms");
	const [readSafety, setReadSafety] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const document = tab === "terms" ? TERMS : FOOD_SAFETY_DISCLAIMER;

	async function accept() {
		setSubmitting(true);
		setError(null);
		try {
			const profile = await acceptTerms();
			haptics.success();
			completeTerms(profile);
		} catch (err) {
			haptics.error();
			setError(
				err instanceof ApiError
					? err.message
					: "Couldn't record that. Check your connection and try again.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<SafeAreaView className="flex-1 bg-cream" edges={["top", "bottom"]}>
			<View className="px-5 pt-2 pb-3">
				<Text className="font-display-bold text-3xl text-brand">
					Before you start
				</Text>
				<Text className="font-body text-gray-500 mt-0.5">
					Please read both. You only have to do this once.
				</Text>
			</View>

			<View className="flex-row gap-2 px-5 pb-3">
				{(
					[
						["terms", "Terms of use"],
						["safety", "Food safety"],
					] as const
				).map(([key, label]) => {
					const on = tab === key;
					return (
						<Pressable
							key={key}
							onPress={() => {
								haptics.select();
								setTab(key);
							}}
							accessibilityRole="tab"
							accessibilityState={{ selected: on }}
							className={`rounded-full px-4 py-2 border ${
								on
									? "bg-forest-800 border-forest-800"
									: "bg-white border-gray-200"
							}`}
						>
							<Text
								className={`font-body-medium text-sm ${
									on ? "text-white" : "text-gray-600"
								}`}
							>
								{label}
							</Text>
						</Pressable>
					);
				})}
			</View>

			<View className="flex-1 mx-5 rounded-card bg-white border border-gray-100 overflow-hidden">
				<LegalDocumentView
					document={document}
					onScrolledToEnd={() => {
						if (tab === "safety") setReadSafety(true);
					}}
				/>
			</View>

			<View className="px-5 pt-4">
				{error && (
					<Text className="font-body text-red-500 text-sm mb-2">{error}</Text>
				)}

				{!readSafety && (
					// The gate is the safety document specifically. Agreeing to terms
					// you have not opened is normal; not opening the page about
					// allergens, in a food app, is the one worth insisting on.
					<Text className="font-body text-gray-500 text-xs mb-2">
						Open the Food safety tab and read to the end to continue.
					</Text>
				)}

				<Button
					onPress={() => void accept()}
					loading={submitting}
					disabled={!readSafety}
					size="lg"
				>
					I agree
				</Button>

				<View className="h-2" />

				<Button variant="outline" onPress={() => void signOut()}>
					Sign out
				</Button>
			</View>
		</SafeAreaView>
	);
}
