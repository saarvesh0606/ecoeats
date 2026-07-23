/** Claims client — mirrors the backend claim schemas. */

import { api } from "@/lib/api";

export type ClaimStatus = "pending" | "picked_up" | "no_show" | "cancelled";

export interface ClaimedListing {
	id: string;
	title: string;
	allergens: string | null;
	campus: string;
	building: string;
	room: string | null;
	placement_note: string | null;
	lat: number;
	lng: number;
	expires_at: string;
	photo_urls: string[];
	directions_url: string;
}

export interface Claim {
	id: string;
	listing_id: string;
	recipient_id: string;
	recipient_name: string;
	quantity: number;
	status: ClaimStatus;
	claimed_at: string;
	reservation_expires_at: string;
	resolved_at: string | null;
	listing: ClaimedListing | null;
	seconds_to_collect: number;
}

interface ClaimList {
	items: Claim[];
	count: number;
}

export async function createClaim(listingId: string): Promise<Claim> {
	return api.post<Claim>("/claims", { listing_id: listingId });
}

export async function fetchMyClaims(): Promise<Claim[]> {
	const list = await api.get<ClaimList>("/claims/mine");
	return list.items;
}

export async function cancelClaim(claimId: string): Promise<Claim> {
	return api.post<Claim>(`/claims/${claimId}/cancel`);
}

/** Claims on a listing — the organizer's view of who is collecting. */
export async function fetchListingClaims(listingId: string): Promise<Claim[]> {
	const list = await api.get<ClaimList>(`/listings/${listingId}/claims`);
	return list.items;
}

export async function confirmPickup(claimId: string): Promise<Claim> {
	return api.post<Claim>(`/claims/${claimId}/pickup`);
}

export async function markNoShow(claimId: string): Promise<Claim> {
	return api.post<Claim>(`/claims/${claimId}/no-show`);
}
