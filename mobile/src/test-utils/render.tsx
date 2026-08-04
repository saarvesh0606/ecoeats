import { render } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * Screens reach for `useToast` and `useConfirm` through context, and both have
 * silent no-op defaults — a screen rendered bare would appear to work while
 * its confirmations resolved instantly and its toasts went nowhere. Wrapping
 * every render in the real providers keeps those paths honest.
 */
export function renderWithProviders(ui: ReactElement) {
	return render(
		<ToastProvider>
			<ConfirmProvider>{ui}</ConfirmProvider>
		</ToastProvider>,
	);
}

/** The same providers as a wrapper component, for `rerender`-style tests. */
export function Providers({ children }: { children: ReactNode }) {
	return (
		<ToastProvider>
			<ConfirmProvider>{children}</ConfirmProvider>
		</ToastProvider>
	);
}

/** A stubbed API module: real ApiError class (screens use `instanceof` and
 *  rethrow anything else) plus jest.fn()s for the client itself. Importing
 *  @/lib/api for real pulls in Firebase, which fails to parse under Jest. */
export function apiModuleMock() {
	class ApiError extends Error {
		status: number;
		constructor(status = 400, message = "api error") {
			super(message);
			this.status = status;
		}
	}
	return {
		ApiError,
		api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), del: jest.fn() },
		fetchProfile: jest.fn(),
		updateProfile: jest.fn(),
	};
}
