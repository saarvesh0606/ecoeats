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

export interface NewListing {
	title: string;
	description: string;
	description_source: "voice" | "manual";
	allergens: string | null;
	dietary_tags: string[];
	quantity_total: number;
	expiry_minutes: 15 | 20 | 30 | 45 | 60;
	location: {
		campus: string;
		building: string;
		room: string | null;
		placement_note: string | null;
		lat: number;
		lng: number;
	};
	photo_urls: string[];
}

export async function createListing(body: NewListing): Promise<Listing> {
	return api.post<Listing>("/listings", body);
}

/** An organizer's own posts, including finished ones. */
export async function fetchMyListings(): Promise<Listing[]> {
	const feed = await api.get<{ items: Listing[]; count: number }>(
		"/listings/mine",
	);
	return feed.items;
}

/** Mark a listing out of stock (status → claimed) or back active. */
export async function setListingStatus(
	id: string,
	status: "active" | "claimed",
): Promise<Listing> {
	return api.patch<Listing>(`/listings/${id}`, { status });
}

export async function cancelListing(id: string): Promise<Listing> {
	return api.post<Listing>(`/listings/${id}/cancel`);
}

export const EXPIRY_CHOICES = [15, 20, 30, 45, 60] as const;

export const DIETARY_TAGS = [
	"vegetarian",
	"vegan",
	"halal",
	"kosher",
	"gluten-free",
] as const;

/** Campus centres, used until a map picker lets organizers drop a precise pin. */
export const CAMPUSES: Record<string, { lat: number; lng: number }> = {
	Tempe: { lat: 33.4242, lng: -111.9281 },
	Downtown: { lat: 33.4517, lng: -112.0741 },
	West: { lat: 33.6119, lng: -112.2601 },
	Polytechnic: { lat: 33.3062, lng: -111.6757 },
};
