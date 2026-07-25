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
	const opacity = useRef(new Animated.Value(0)).current;
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const show = useCallback(
		(msg: string) => {
			setMessage(msg);
			if (timer.current) clearTimeout(timer.current);
			Animated.timing(opacity, {
				toValue: 1,
				duration: 150,
				useNativeDriver: true,
			}).start();
			timer.current = setTimeout(() => {
				Animated.timing(opacity, {
					toValue: 0,
					duration: 250,
					useNativeDriver: true,
				}).start(() => setMessage(null));
			}, 2200);
		},
		[opacity],
	);

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
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
						opacity,
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
