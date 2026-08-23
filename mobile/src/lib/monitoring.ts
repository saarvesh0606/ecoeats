import Constants from "expo-constants";
import { config } from "@/config";

/**
 * Crash and error reporting for the client.
 *
 * The backend has had Sentry since it deployed; the phone has had nothing, so
 * anything that went wrong on a device was only ever visible if someone was
 * holding it and thought to mention it.
 *
 * Two deliberate refusals here.
 *
 * **No DSN means no reporting, not an error.** A missing DSN is a
 * configuration state — a fork, a contributor, a local checkout — and none of
 * those should have the app complain at them about telemetry they never asked
 * for.
 *
 * **The SDK is loaded defensively.** @sentry/react-native is a native module,
 * so it only exists in a binary built after it was added. Updates ship over the
 * air and reach binaries built before that — importing it there would throw at
 * startup and take the app down, which would mean no update could be published
 * until a build existed to match. Reporting is worth having; it is not worth
 * coupling every future update to a build, and certainly not worth a crash on
 * launch. So this degrades to doing nothing.
 */
export function initMonitoring(): void {
	const dsn = config.sentryDsn;
	if (!dsn) return;

	try {
		// Required rather than imported so a binary without the native module
		// fails here, quietly, instead of at module load.
		const Sentry = require("@sentry/react-native") as {
			init: (options: Record<string, unknown>) => void;
		};

		Sentry.init({
			dsn,
			// Which build a report came from. Without this every crash looks like it
			// came from the same version, and "is this already fixed?" is
			// unanswerable — which matters more here than usual, because the
			// JavaScript now moves independently of the binary.
			release: Constants.expoConfig?.version ?? "unknown",
			dist: Constants.expoConfig?.ios?.buildNumber ?? undefined,
			// Traces cost quota and answer questions nobody is asking yet. Crashes
			// are the thing that has been invisible.
			tracesSampleRate: 0,
			// Breadcrumbs can carry whatever was typed into a field, and the fields
			// here are an ASU email and a password.
			sendDefaultPii: false,
		});
	} catch {
		// An older binary, or a build where the native side did not link. The app
		// runs; it simply reports nothing.
	}
}
