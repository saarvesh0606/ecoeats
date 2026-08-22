import { ScrollView, Text, View } from "react-native";
import type { LegalDocument } from "@/lib/legal";

/**
 * Renders one legal document — terms, disclaimer or privacy.
 *
 * Shared so all three read identically wherever they appear: inside the
 * first-run acceptance gate, and from Settings afterwards. Two renderings of
 * the same document that drifted apart would be worse than none.
 */
export function LegalDocumentView({
	document,
	scrollable = true,
	onScrolledToEnd,
}: {
	document: LegalDocument;
	/** Off when the caller supplies its own scroll container. */
	scrollable?: boolean;
	/** Fires once the reader reaches the bottom. */
	onScrolledToEnd?: () => void;
}) {
	const body = (
		<View>
			<Text className="font-display-bold text-2xl text-forest-800">
				{document.title}
			</Text>
			<Text className="font-body text-ink-muted mt-2 leading-6">
				{document.summary}
			</Text>

			{document.sections.map((section) => (
				<View key={section.heading} className="mt-6">
					<Text className="font-body-semibold text-base text-forest-800">
						{section.heading}
					</Text>
					<Text className="font-body text-ink-muted mt-1.5 leading-6">
						{section.body}
					</Text>
				</View>
			))}
		</View>
	);

	if (!scrollable) return body;

	return (
		<ScrollView
			className="flex-1"
			contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
			showsVerticalScrollIndicator={true}
			onScroll={({ nativeEvent: e }) => {
				// Within a line or so of the bottom counts as read — demanding the
				// exact pixel means a reader who has plainly finished still can't
				// continue.
				const atEnd =
					e.layoutMeasurement.height + e.contentOffset.y >=
					e.contentSize.height - 24;
				if (atEnd) onScrolledToEnd?.();
			}}
			scrollEventThrottle={16}
		>
			{body}
		</ScrollView>
	);
}
