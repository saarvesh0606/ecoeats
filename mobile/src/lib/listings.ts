/**
 * Listings client — mirrors the backend ListingOut / ListingFeed schemas.
 */

import { api } from "@/lib/api";

export type ListingStatus =
	| "draft"
	| "scheduled"
	| "active"
	| "claimed"
	| "expired"
	| "cancelled";

export interface Organizer {
	id: string;
	name: string;
	/** Average star rating, or null if the host hasn't been rated. */
	rating: number | null;
	rating_count: number;
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
	scheduled_for: string | null;
	organizer: Organizer;
	photo_urls: string[];
	distance_miles: number | null;
	seconds_remaining: number;
	is_claimable: boolean;
	is_saved: boolean;
	interested_count: number;
}

interface ListingFeed {
	items: Listing[];
	count: number;
	next_cursor: string | null;
}

/** One page of the feed. `nextCursor` is null on the last page. */
export interface FeedPage {
	items: Listing[];
	nextCursor: string | null;
}

export interface FeedFilters {
	dietary?: string[];
	lat?: number;
	lng?: number;
	radiusMiles?: number;
	maxMinutes?: number;
	q?: string;
}

function toQuery(filters: FeedFilters, cursor?: string): string {
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
	if (filters.q) params.set("q", filters.q);
	if (cursor) params.set("cursor", cursor);
	const query = params.toString();
	return query ? `?${query}` : "";
}

/**
 * Fetch one page of the feed. Pass the previous page's `nextCursor` to get the
 * next; a null `nextCursor` in the result means there are no more pages.
 */
export async function fetchFeed(
	filters: FeedFilters = {},
	cursor?: string,
): Promise<FeedPage> {
	const feed = await api.get<ListingFeed>(`/listings${toQuery(filters, cursor)}`);
	return { items: feed.items, nextCursor: feed.next_cursor };
}

export async function fetchListing(id: string): Promise<Listing> {
	return api.get<Listing>(`/listings/${id}`);
}

/** Bookmark a listing. Idempotent on the server. */
export async function saveListing(id: string): Promise<void> {
	await api.post<void>(`/listings/${id}/save`);
}

/** Remove a bookmark. Idempotent on the server. */
export async function unsaveListing(id: string): Promise<void> {
	await api.del<void>(`/listings/${id}/save`);
}

/** The current user's bookmarked listings, most recently saved first. */
export async function fetchSaved(): Promise<Listing[]> {
	const feed = await api.get<ListingFeed>("/listings/saved");
	return feed.items;
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
	publish?: "now" | "draft" | "scheduled";
	scheduled_for?: string | null;
}

export async function createListing(body: NewListing): Promise<Listing> {
	return api.post<Listing>("/listings", body);
}

/** Publish a draft or scheduled post now (status -> active). */
export async function publishListing(id: string): Promise<Listing> {
	return api.patch<Listing>(`/listings/${id}`, { status: "active" });
}

/** An organizer's own posts, including finished ones. */
export async function fetchMyListings(): Promise<Listing[]> {
	const feed = await api.get<{ items: Listing[]; count: number }>(
		"/listings/mine",
	);
	return feed.items;
}

export interface HostImpact {
	meals_shared: number;
	people_fed: number;
	active_posts: number;
}

/** A host's cumulative impact, computed server-side from completed pickups. */
export async function fetchImpact(): Promise<HostImpact> {
	return api.get<HostImpact>("/listings/impact");
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
