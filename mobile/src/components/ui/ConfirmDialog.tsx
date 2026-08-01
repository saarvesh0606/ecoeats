import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useRef,
	useState,
} from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";

export interface ConfirmSpec {
	title: string;
	message: string;
	/** Label on the affirmative button. */
	confirmLabel?: string;
	cancelLabel?: string;
	/** Styles the action as destructive. Defaults to true — this is mostly used
	 *  to guard things that can't be undone. */
	destructive?: boolean;
}

type ConfirmFn = (options: ConfirmSpec) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => true);

/** Ask the user to confirm; resolves true if they accept. */
export function useConfirm(): ConfirmFn {
	return useContext(ConfirmContext);
}

/**
 * An in-app confirmation dialog, replacing `window.confirm`.
 *
 * The browser dialog is jarring in a phone-shaped app: it's chrome-styled,
 * shows the page's URL, and can't carry the product's voice. It also blocks the
 * JS thread outright, so anything mid-flight (a countdown, an SSE update)
 * freezes behind it.
 *
 * Exposed as a promise so call sites keep reading top-to-bottom —
 * `if (!(await confirm({...}))) return;` — rather than splitting into callbacks.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
	const [options, setOptions] = useState<ConfirmSpec | null>(null);
	const resolver = useRef<((ok: boolean) => void) | null>(null);

	const confirm = useCallback<ConfirmFn>((next) => {
		setOptions(next);
		return new Promise<boolean>((resolve) => {
			resolver.current = resolve;
		});
	}, []);

	const settle = useCallback((accepted: boolean) => {
		setOptions(null);
		// Guard against a double-settle (backdrop tap racing a button press):
		// resolving a promise twice is silent, but clearing makes it explicit.
		resolver.current?.(accepted);
		resolver.current = null;
	}, []);

	return (
		<ConfirmContext.Provider value={confirm}>
			{children}
			<Modal
				visible={options !== null}
				transparent
				animationType="fade"
				// Android's back button must resolve the promise, not just hide the
				// dialog, or the caller waits forever.
				onRequestClose={() => settle(false)}
			>
				<Pressable
					className="flex-1 bg-black/40 items-center justify-center px-8"
					onPress={() => settle(false)}
				>
					{/* Swallow taps inside the card so they don't dismiss it. */}
					<Pressable
						className="bg-cream rounded-card p-5 w-full max-w-sm"
						onPress={() => {}}
					>
						<Text className="font-display-bold text-xl text-gray-900">
							{options?.title}
						</Text>
						<Text className="font-body text-gray-600 mt-2 mb-5">
							{options?.message}
						</Text>
						<View className="gap-2">
							<Button
								variant={options?.destructive === false ? "primary" : "danger"}
								onPress={() => settle(true)}
							>
								{options?.confirmLabel ?? "Confirm"}
							</Button>
							<Button variant="ghost" onPress={() => settle(false)}>
								{options?.cancelLabel ?? "Cancel"}
							</Button>
						</View>
					</Pressable>
				</Pressable>
			</Modal>
		</ConfirmContext.Provider>
	);
}
