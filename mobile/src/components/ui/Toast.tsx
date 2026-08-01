import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { Animated, Text, View } from "react-native";

interface ToastContextValue {
	/** Briefly show a confirmation message at the bottom of the screen. */
	show: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

/** How long the banner rests before it leaves. */
const VISIBLE_MS = 2200;
/** How far it travels on the way in and out. */
const TRAVEL = 24;

export function useToast(): ToastContextValue {
	return useContext(ToastContext);
}

/**
 * App-wide toast. A single lightweight confirmation banner so actions that keep
 * the user on the same screen (marking a post out of stock, saving a profile,
 * confirming a pickup) give clear feedback instead of appearing to do nothing.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
	const [message, setMessage] = useState<string | null>(null);
	/** 0 = off screen and transparent, 1 = resting in place. */
	const progress = useRef(new Animated.Value(0)).current;
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const show = useCallback(
		(msg: string) => {
			setMessage(msg);
			if (timer.current) clearTimeout(timer.current);
			if (clearTimer.current) clearTimeout(clearTimer.current);

			// Re-showing while one is still up restarts the entrance rather than
			// letting the new message appear mid-fade.
			progress.setValue(0);
			Animated.spring(progress, {
				toValue: 1,
				useNativeDriver: true,
				speed: 18,
				bounciness: 6,
			}).start();

			timer.current = setTimeout(() => {
				Animated.timing(progress, {
					toValue: 0,
					duration: 220,
					useNativeDriver: true,
				}).start(({ finished }) => {
					if (finished) setMessage(null);
				});
				// Unmount on a timer as well: if that exit never runs, the banner
				// would otherwise sit on screen permanently.
				clearTimer.current = setTimeout(() => setMessage(null), 400);
			}, VISIBLE_MS);
		},
		[progress],
	);

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
			if (clearTimer.current) clearTimeout(clearTimer.current);
		},
		[],
	);

	return (
		<ToastContext.Provider value={{ show }}>
			{children}
			{message && (
				<Animated.View
					pointerEvents="none"
					style={{
						position: "absolute",
						left: 0,
						right: 0,
						bottom: 96,
						alignItems: "center",
						paddingHorizontal: 24,
						opacity: progress,
						// Rises into place and drops back out, so it reads as arriving
						// from the bottom of the screen rather than materialising.
						transform: [
							{
								translateY: progress.interpolate({
									inputRange: [0, 1],
									outputRange: [TRAVEL, 0],
								}),
							},
						],
					}}
				>
					<View className="bg-forest-900 rounded-full px-4 py-2.5">
						<Text className="font-body-semibold text-white text-sm text-center">
							{message}
						</Text>
					</View>
				</Animated.View>
			)}
		</ToastContext.Provider>
	);
}
