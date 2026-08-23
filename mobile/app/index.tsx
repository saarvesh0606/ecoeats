import { View } from "react-native";
import { Spinner } from "@/components/ui/Spinner";

/**
 * The entry route. It renders nothing meaningful on its own — the gate in the
 * root layout redirects to the right screen as soon as auth status resolves.
 */
export default function Index() {
	return (
		<View className="flex-1 bg-page items-center justify-center">
			<Spinner />
		</View>
	);
}
