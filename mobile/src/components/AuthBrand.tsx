import { Image, Text, View } from "react-native";

/**
 * The app icon at the size iOS draws it on the home screen, and the same mark
 * again at a quieter size for the screens people arrive at from an email.
 */
const FULL_SIZE = 76;
const COMPACT_SIZE = 56;

/**
 * The app's mark, and what it is for.
 *
 * Sign-in owns the full version: the icon someone just tapped, the name, and a
 * line saying what the thing does. Forgotten passwords and email confirmation
 * used to carry none of it, which is where it mattered most — those two are
 * reached from a mail client, often minutes later, and a bare heading on a
 * plain background is exactly what a phishing page looks like. The mark is
 * what says this is the app you installed.
 *
 * The wordmark stays behind a flag rather than shipping everywhere, because
 * those screens already have a heading of their own. Two display-bold lines
 * stacked would compete, and the screen's own title is the one that should
 * win — so the icon and the tagline carry the identity there.
 */
export function AuthBrand({ wordmark = false }: { wordmark?: boolean }) {
	const size = wordmark ? FULL_SIZE : COMPACT_SIZE;

	return (
		<View className="items-center mb-7">
			{/* Rounded to match how iOS renders it. Squared off, it reads as a
			    stray image rather than the app's identity. */}
			<Image
				source={require("../../assets/icon.png")}
				style={{
					width: size,
					height: size,
					borderRadius: size * 0.22,
				}}
				resizeMode="contain"
				accessibilityLabel="EcoEats"
				className={wordmark ? "mb-5" : "mb-3"}
			/>

			{wordmark && (
				<Text className="font-display-bold text-3xl text-brand text-center">
					EcoEats
				</Text>
			)}

			<Text className="font-body text-gray-500 text-sm mt-2 text-center">
				Share more. Waste less. Impact together.
			</Text>
		</View>
	);
}
