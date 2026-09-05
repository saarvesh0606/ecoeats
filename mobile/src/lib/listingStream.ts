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
 * Which listings this subscriber wants. Omit it and the server sends every
 * event, which is what it did before scoping existed.
 */
export interface ListingStreamScope {
	/** A host's dashboard: only listings this account posted. */
	mine?: boolean;
	/** A recipient's feed: only listings inside this circle. */
	lat?: number;
	lng?: number;
	radiusMiles?: number;
}

/**
 * The server ignores a partial circle rather than rejecting it, but sending one
 * is still pointless traffic — and quietly not narrowing anything is exactly
 * the kind of thing that looks like it works.
 */
export function scopeParams(
	scope: ListingStreamScope | undefined,
): string[] {
	if (!scope) return [];
	if (scope.mine) return ["mine=true"];
	const { lat, lng, radiusMiles } = scope;
	if (lat === undefined || lng === undefined || radiusMiles === undefined) {
		return [];
	}
	return [`lat=${lat}`, `lng=${lng}`, `radius_miles=${radiusMiles}`];
}

/**
 * Subscribe to listing changes. Returns a function that closes the connection.
 * Resolves once the connection is set up (not once the server confirms it).
 */
export async function subscribeToListings(
	onEvent: (event: ListingStreamEvent) => void,
	scope?: ListingStreamScope,
): Promise<() => void> {
	const token = await currentBearerToken();
	const params = scopeParams(scope);
	const query = params.length ? `?${params.join("&")}` : "";
	const base = `${config.apiBase}/listings/stream${query}`;

	// Web: native EventSource, token in the query string.
	const WebEventSource = (globalThis as { EventSource?: typeof EventSource })
		.EventSource;
	if (Platform.OS === "web" && WebEventSource) {
		// `base` may already carry the scope, so the token joins with & not ?.
		const sep = params.length ? "&" : "?";
		const url = token
			? `${base}${sep}token=${encodeURIComponent(token)}`
			: base;
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
