import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { ApiError, registerProfile, type UserRole } from "@/lib/api";

// The backend role value stays "organizer"; the interface calls it "Host".
const CHOICES: {
	role: UserRole;
	title: string;
	blurb: string;
	renderIcon: (color: string) => React.ReactNode;
}[] = [
	{
		role: "recipient",
		title: "Recipient",
		blurb: "I want to find food near me.",
		renderIcon: (color) => (
			<Ionicons name="leaf-outline" size={26} color={color} />
		),
	},
	{
		role: "organizer",
		title: "Host",
		blurb: "I have extra food to share.",
		renderIcon: (color) => (
			<MaterialCommunityIcons name="storefront-outline" size={26} color={color} />
		),
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
			<Text className="font-display-bold text-3xl text-forest-800 text-center">
				How will you use EcoEats?
			</Text>
			<Text className="font-body text-gray-500 text-center mt-2 mb-8">
				This sets up your account. It stays the same afterward.
			</Text>

			<Text className="font-body-semibold text-gray-500 mb-3">I want to…</Text>
			<View className="flex-row gap-4 mb-2">
				{CHOICES.map((choice) => {
					const active = selected === choice.role;
					return (
						<Pressable
							key={choice.role}
							onPress={() => setSelected(choice.role)}
							accessibilityRole="radio"
							accessibilityState={{ selected: active }}
							className={`flex-1 rounded-card border p-5 ${
								active
									? "border-forest-800 bg-forest-800"
									: "border-gray-200 bg-white"
							}`}
						>
							{choice.renderIcon(active ? "#ffffff" : "#1B4332")}
							<Text
								className={`font-display-bold text-lg mt-3 ${
									active ? "text-white" : "text-gray-900"
								}`}
							>
								{choice.title}
							</Text>
							<Text
								className={`font-body text-sm mt-1 ${
									active ? "text-forest-100" : "text-gray-500"
								}`}
							>
								{choice.blurb}
							</Text>
							{active && (
								<View className="mt-3">
									<Ionicons name="checkmark-circle" size={20} color="#ffffff" />
								</View>
							)}
						</Pressable>
					);
				})}
			</View>

			{error && (
				<Text className="text-red-500 font-body text-sm mt-2 mb-2">{error}</Text>
			)}

			<View className="h-4" />
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
