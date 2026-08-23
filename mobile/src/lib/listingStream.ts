/**
 * Live listing updates over Server-Sent Events — the replacement for polling.
 *
 * One small message arrives only when a listing actually changes, instead of
 * the whole feed being re-fetched every 20 seconds. On the web the browser's
 * native EventSource is used (it can't set headers, so the token goes in the
 * query string); on native, react-native-sse carries the token in a header.
 */

import { Platform } from "react-native";
import RNEventSource from "react-native-sse";
import { config } from "@/config";
import { currentBearerToken } from "@/lib/api";

export interface ListingStreamEvent {
	listing_id: string;
	quantity_remaining: number;
	status: string;
	expires_at: string;
}

function parse(data: string | null | undefined): ListingStreamEvent | null {
	if (!data) return null;
	try {
		return JSON.parse(data) as ListingStreamEvent;
	} catch {
		return null;
	}
}

/**
 * Subscribe to listing changes. Returns a function that closes the connection.
 * Resolves once the connection is set up (not once the server confirms it).
 */
export async function subscribeToListings(
	onEvent: (event: ListingStreamEvent) => void,
): Promise<() => void> {
	const token = await currentBearerToken();
	const base = `${config.apiBase}/listings/stream`;

	// Web: native EventSource, token in the query string.
	const WebEventSource = (globalThis as { EventSource?: typeof EventSource })
		.EventSource;
	if (Platform.OS === "web" && WebEventSource) {
		const url = token ? `${base}?token=${encodeURIComponent(token)}` : base;
		const es = new WebEventSource(url);
		es.onmessage = (event: MessageEvent) => {
			const parsed = parse(event.data);
			if (parsed) onEvent(parsed);
		};
		return () => es.close();
	}

	// Native: react-native-sse, token in an Authorization header.
	const es = new RNEventSource(base, {
		headers: token ? { Authorization: `Bearer ${token}` } : undefined,
	});
	const listener = (event: { type: string; data?: string | null }) => {
		if (event.type === "message") {
			const parsed = parse(event.data);
			if (parsed) onEvent(parsed);
		}
	};
	es.addEventListener("message", listener);
	return () => {
		es.removeAllEventListeners();
		es.close();
	};
}
