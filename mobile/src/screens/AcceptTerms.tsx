import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { ApiError, acceptTerms } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { FOOD_SAFETY_DISCLAIMER, TERMS } from "@/lib/legal";

/** The documents in the order they must be read. */
const STEPS = [TERMS, FOOD_SAFETY_DISCLAIMER] as const;

/**
 * The one screen nobody gets past without agreeing.
 *
 * Shown after the profile exists — so acceptance is recorded against a real
 * account — and before the app proper. There is deliberately no skip: the
 * router sends anyone in `needs-terms` straight back here, so a dismiss button
 * would only ever loop.
 *
 * Sequential rather than tabbed. Tabs let someone agree having opened one
 * document, and — because both tabs shared a single scroll container — carried
 * the first document's scroll offset onto the second, so the reader arrived
 * halfway down a page they had never seen and the "read to the end" gate had
 * already been satisfied by the wrong content. Each step now owns its own
 * scroll position (the `key` below remounts the view) and its own gate.
 *
 * The food safety disclaimer is a step rather than a link. It is the part that
 * actually matters for a food app, and a link is a thing people do not open.
 */
export function AcceptTerms() {
	const { completeTerms, signOut } = useAuth();
	const [step, setStep] = useState(0);
	const [readSteps, setReadSteps] = useState<boolean[]>(() =>
		STEPS.map(() => false),
	);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const document = STEPS[step];
	const isLast = step === STEPS.length - 1;
	const readThis = readSteps[step];

	function markRead() {
		setReadSteps((prev) =>
			prev[step] ? prev : prev.map((v, i) => (i === step ? true : v)),
		);
	}

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
		<SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
			<View className="px-5 pt-2 pb-3">
				<Text className="font-display-bold text-3xl text-brand">
					Before you start
				</Text>
				<Text className="font-body text-gray-500 mt-0.5">
					Please read both. You only have to do this once.
				</Text>
			</View>

			{/* Which of the two you are on, and how far in. Dots rather than tabs:
			    they report position without offering a jump the flow does not allow. */}
			<View className="flex-row items-center gap-2 px-5 pb-3">
				{STEPS.map((doc, i) => (
					<View
						key={doc.title}
						className={`h-1 flex-1 rounded-full ${
							i <= step ? "bg-forest-800" : "bg-gray-200"
						}`}
					/>
				))}
				<Text className="font-body text-gray-500 text-xs ml-1">
					{step + 1} of {STEPS.length}
				</Text>
			</View>

			<View className="flex-1 mx-5 rounded-card bg-card border border-gray-100 overflow-hidden">
				<LegalDocumentView
					// Remounts on every step, which is what resets the scroll offset.
					// Without it the second document opens wherever the first was left.
					key={document.title}
					document={document}
					onScrolledToEnd={markRead}
				/>
			</View>

			<View className="px-5 pt-4">
				{error && (
					<Text className="font-body text-red-500 text-sm mb-2">{error}</Text>
				)}

				{!readThis && (
					<Text className="font-body text-gray-500 text-xs mb-2">
						Scroll to the end of {document.title.toLowerCase()} to continue.
					</Text>
				)}

				<Button
					onPress={() => {
						if (isLast) {
							void accept();
							return;
						}
						haptics.select();
						setStep((s) => s + 1);
					}}
					loading={submitting}
					disabled={!readThis}
					size="lg"
				>
					{isLast ? "Accept and continue" : "Next"}
				</Button>

				<View className="h-2" />

				{step > 0 ? (
					<Button variant="outline" onPress={() => setStep((s) => s - 1)}>
						Back
					</Button>
				) : (
					<Button variant="outline" onPress={() => void signOut()}>
						Sign out
					</Button>
				)}
			</View>
		</SafeAreaView>
	);
}
