/**
 * Listings client — mirrors the backend ListingOut / ListingFeed schemas.
 */

import { api } from "@/lib/api";

export type ListingStatus = "active" | "claimed" | "expired" | "cancelled";

export interface Organizer {
	id: string;
	name: string;
}

export interface Listing {
	id: string;
	title: string;
	description: string;
	allergens: string | null;
	dietary_tags: string[];
	quantity_total: number;
	quantity_remaining: number;
	campus: string;
	building: string;
	room: string | null;
	placement_note: string | null;
	lat: number;
	lng: number;
	expires_at: string;
	status: ListingStatus;
	created_at: string;
	organizer: Organizer;
	photo_urls: string[];
	distance_miles: number | null;
	seconds_remaining: number;
	is_claimable: boolean;
}

interface ListingFeed {
	items: Listing[];
	count: number;
}

export interface FeedFilters {
	dietary?: string[];
	lat?: number;
	lng?: number;
	radiusMiles?: number;
	maxMinutes?: number;
}

function toQuery(filters: FeedFilters): string {
	const params = new URLSearchParams();
	for (const tag of filters.dietary ?? []) params.append("dietary", tag);
	if (filters.lat !== undefined) params.set("lat", String(filters.lat));
	if (filters.lng !== undefined) params.set("lng", String(filters.lng));
	if (filters.radiusMiles !== undefined) {
		params.set("radius_miles", String(filters.radiusMiles));
	}
	if (filters.maxMinutes !== undefined) {
		params.set("max_minutes", String(filters.maxMinutes));
	}
	const q = params.toString();
	return q ? `?${q}` : "";
}

export async function fetchFeed(filters: FeedFilters = {}): Promise<Listing[]> {
	const feed = await api.get<ListingFeed>(`/listings${toQuery(filters)}`);
	return feed.items;
}

export async function fetchListing(id: string): Promise<Listing> {
	return api.get<Listing>(`/listings/${id}`);
}
