import type { ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";

/**
 * Keeps the app at phone proportions on screens wider than a phone.
 *
 * The layouts are composed for a handset (roughly 360–430pt: Android ~360–412,
 * iPhone 390, iPhone Pro Max 430). Stretched across a desktop browser the same
 * screens read as broken — line lengths run long and the tab bar floats. On a
 * real device this is a no-op: the window is narrower than the breakpoint, so
 * children render with no extra wrapper at all.
 */

/** Widest a handset layout should ever get. iPhone Pro Max is 430pt. */
export const PHONE_MAX_WIDTH = 430;

/** Below this, we're on a phone-sized window and shouldn't intervene. */
const FRAME_BREAKPOINT = 500;

export function PhoneFrame({ children }: { children: ReactNode }) {
	const { width } = useWindowDimensions();

	if (width < FRAME_BREAKPOINT) {
		return <>{children}</>;
	}

	return (
		<View className="flex-1 bg-forest-900/95 items-center">
			<View
				className="flex-1 w-full bg-page border-x border-black/10"
				style={{ maxWidth: PHONE_MAX_WIDTH }}
			>
				{children}
			</View>
		</View>
	);
}
