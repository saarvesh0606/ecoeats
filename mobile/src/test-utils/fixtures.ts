/**
 * Shared fixtures for the client tests.
 *
 * Screens count down against a clock, so tests pin one instead of racing the
 * real thing: a listing 52m00.5s out reads "51m" the moment a slow first render
 * eats the half second. Build every timestamp from NOW and freeze `useNow` to
 * the same value.
 */

import type { Claim, ClaimedListing } from "@/lib/claims";
import type { Listing } from "@/lib/listings";
import type { AppNotification } from "@/lib/notifications";

/** The instant every fixture is relative to. */
export const NOW = new Date("2026-08-04T12:00:00Z").getTime();

/** Drop this in a test file to freeze the screens' clock at NOW. */
export const FROZEN_NOW_MOCK = () => ({
	useNow: () => new Date("2026-08-04T12:00:00Z").getTime(),
});

export function makeListing(overrides: Partial<Listing> = {}): Listing {
	return {
		id: "l1",
		title: "Leftover pizza",
		description: "Cheese and pepperoni",
		allergens: null,
		dietary_tags: [],
		quantity_total: 10,
		quantity_remaining: 4,
		campus: "Tempe",
		building: "Wrigley Hall",
		room: "205",
		placement_note: null,
		lat: 33.4,
		lng: -111.9,
		expires_at: new Date(NOW + 52 * 60_000).toISOString(),
		status: "active",
		created_at: new Date(NOW).toISOString(),
		scheduled_for: null,
		organizer: { id: "o1", name: "Front Desk", rating: null, rating_count: 0 },
		photo_urls: [],
		distance_miles: null,
		seconds_remaining: 3120,
		is_claimable: true,
		is_saved: false,
		interested_count: 0,
		...overrides,
	};
}

export function makeClaimedListing(
	overrides: Partial<ClaimedListing> = {},
): ClaimedListing {
	return {
		id: "l1",
		title: "Leftover pizza",
		allergens: null,
		campus: "Tempe",
		building: "Wrigley Hall",
		room: "205",
		placement_note: null,
		lat: 33.4,
		lng: -111.9,
		expires_at: new Date(NOW + 30 * 60_000).toISOString(),
		photo_urls: [],
		directions_url: "https://maps.example/1",
		...overrides,
	};
}

export function makeClaim(overrides: Partial<Claim> = {}): Claim {
	return {
		id: "c1",
		listing_id: "l1",
		recipient_id: "r1",
		recipient_name: "Sam Rivera",
		quantity: 1,
		status: "pending",
		claimed_at: new Date(NOW - 5 * 60_000).toISOString(),
		reservation_expires_at: new Date(NOW + 15 * 60_000).toISOString(),
		resolved_at: null,
		listing: makeClaimedListing(),
		seconds_to_collect: 900,
		is_rated: false,
		...overrides,
	};
}

export function makeNotification(
	overrides: Partial<AppNotification> = {},
): AppNotification {
	return {
		id: "n1",
		message: "Sam claimed Leftover pizza",
		listing_id: null,
		read: false,
		created_at: new Date(NOW).toISOString(),
		...overrides,
	};
}
