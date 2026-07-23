import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { ApiError, registerProfile, type UserRole } from "@/lib/api";

const CHOICES: { role: UserRole; title: string; blurb: string }[] = [
	{
		role: "recipient",
		title: "I'm here for food",
		blurb: "Browse what's available on campus and claim a portion.",
	},
	{
		role: "organizer",
		title: "I have food to share",
		blurb: "Post surplus food so students nearby can come grab it.",
	},
];

export default function RoleScreen() {
	const { completeProfile, signOut } = useAuth();
	const [selected, setSelected] = useState<UserRole | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function onContinue() {
		if (!selected) return;
		setError(null);
		setLoading(true);
		try {
			const profile = await registerProfile(selected);
			completeProfile(profile); // flips status to "ready"; gate routes to home
		} catch (err) {
			setError(
				err instanceof ApiError ? err.message : "Couldn't save. Try again.",
			);
		} finally {
			setLoading(false);
		}
	}

	return (
		<View className="flex-1 bg-cream justify-center px-6">
			<Text className="font-display font-bold text-3xl text-forest-700 text-center">
				How will you use EcoEats?
			</Text>
			<Text className="font-body text-gray-600 text-center mt-2 mb-8">
				This sets up your account. It stays the same afterward.
			</Text>

			{CHOICES.map((choice) => {
				const active = selected === choice.role;
				return (
					<Pressable
						key={choice.role}
						onPress={() => setSelected(choice.role)}
						className={`rounded-card border-2 p-5 mb-4 ${
							active
								? "border-forest-700 bg-forest-50"
								: "border-gray-200 bg-white"
						}`}
					>
						<Text className="font-display font-bold text-lg text-gray-900">
							{choice.title}
						</Text>
						<Text className="font-body text-gray-600 mt-1">{choice.blurb}</Text>
					</Pressable>
				);
			})}

			{error && (
				<Text className="text-red-500 font-body text-sm mt-2 mb-2">{error}</Text>
			)}

			<View className="h-2" />
			<Button
				onPress={onContinue}
				loading={loading}
				disabled={!selected}
				size="lg"
			>
				Continue
			</Button>
			<View className="h-3" />
			<Button onPress={signOut} variant="ghost">
				Sign out
			</Button>
		</View>
	);
}
