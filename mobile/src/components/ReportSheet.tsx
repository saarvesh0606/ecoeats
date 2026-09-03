import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { haptics } from "@/lib/haptics";
import { REPORT_REASONS, type ReportReason } from "@/lib/moderation";

/**
 * Pick a reason and report a listing.
 *
 * A sheet rather than the confirm dialog because a report needs a choice, not
 * a yes: the reason drives how urgently a human looks at it, and "unsafe food"
 * is the one that can put somebody in hospital, so it leads the list.
 *
 * Deliberately does not report what happened next. The caller shows a plain
 * acknowledgement — whether the listing came down, and what became of the
 * account behind it, is not the reporter's to know, and saying would turn
 * reporting into a way of probing other people's accounts.
 */
export function ReportSheet({
	visible,
	onClose,
	onSubmit,
	submitting = false,
}: {
	visible: boolean;
	onClose: () => void;
	onSubmit: (reason: ReportReason, detail: string) => void;
	submitting?: boolean;
}) {
	const [reason, setReason] = useState<ReportReason | null>(null);
	const [detail, setDetail] = useState("");

	// "Something else" with no words is a report nobody can act on, and the
	// server rejects it — so the button waits rather than the network failing.
	const needsDetail = reason === "other";
	const ready = reason !== null && (!needsDetail || detail.trim().length > 0);

	function close() {
		setReason(null);
		setDetail("");
		onClose();
	}

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={close}
		>
			<Pressable
				className="flex-1 bg-black/40 justify-end"
				onPress={close}
				accessibilityLabel="Dismiss"
			>
				{/* Swallow taps inside the card so they don't dismiss it. */}
				<Pressable
					className="bg-page rounded-t-card p-5 pb-8"
					onPress={() => {}}
				>
					<Text className="font-display-bold text-xl text-gray-900">
						Report this listing
					</Text>
					<Text className="font-body text-gray-600 mt-1 mb-4">
						Tell us what is wrong and we will look at it. Reports are private.
					</Text>

					<View className="gap-2 mb-4">
						{REPORT_REASONS.map((option) => {
							const on = reason === option.value;
							return (
								<Pressable
									key={option.value}
									onPress={() => {
										haptics.select();
										setReason(option.value);
									}}
									accessibilityRole="radio"
									accessibilityState={{ selected: on }}
									className={`flex-row items-center gap-3 rounded-btn border px-4 py-3 ${
										on
											? "border-forest-800 bg-forest-50"
											: "border-gray-200 bg-card"
									}`}
								>
									<View
										className={`w-4 h-4 rounded-full border-2 ${
											on ? "border-forest-800 bg-forest-800" : "border-gray-300"
										}`}
									/>
									<Text
										className={`font-body flex-1 ${
											on ? "text-brand font-body-semibold" : "text-gray-700"
										}`}
									>
										{option.label}
									</Text>
								</Pressable>
							);
						})}
					</View>

					{reason !== null && (
						<Input
							label={
								needsDetail ? "What is wrong" : "Anything to add (optional)"
							}
							placeholder="e.g. the food was gone when I arrived"
							value={detail}
							onChangeText={setDetail}
							multiline
							style={{ minHeight: 72, textAlignVertical: "top" }}
						/>
					)}

					<Button
						variant="danger"
						onPress={() => reason && onSubmit(reason, detail)}
						disabled={!ready}
						loading={submitting}
					>
						Send report
					</Button>
					<View className="h-2" />
					<Button variant="ghost" onPress={close}>
						Cancel
					</Button>
				</Pressable>
			</Pressable>
		</Modal>
	);
}
