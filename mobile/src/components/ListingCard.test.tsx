import { fireEvent, render } from "@testing-library/react-native";
import type { Listing } from "@/lib/listings";
import { ListingCard } from "./ListingCard";

function makeListing(overrides: Partial<Listing> = {}): Listing {
	return {
		id: "listing-1",
		title: "Leftover pizza",
		description: "Cheese and pepperoni",
		allergens: "Contains gluten and dairy",
		dietary_tags: ["vegetarian"],
		quantity_total: 15,
		quantity_remaining: 8,
		campus: "Tempe",
		building: "Wrigley Hall",
		room: "205",
		placement_note: null,
		lat: 33.4225,
		lng: -111.933,
		expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
		status: "active",
		created_at: new Date().toISOString(),
		organizer: { id: "org-1", name: "Front Desk" },
		photo_urls: [],
		distance_miles: null,
		seconds_remaining: 1800,
		is_claimable: true,
		...overrides,
	};
}

describe("ListingCard", () => {
	it("shows the title and location", () => {
		const { getByText } = render(
			<ListingCard listing={makeListing()} now={Date.now()} onPress={() => {}} />,
		);
		expect(getByText("Leftover pizza")).toBeTruthy();
		expect(getByText("Wrigley Hall, Room 205")).toBeTruthy();
	});

	it("surfaces the allergen warning prominently", () => {
		const { getByText } = render(
			<ListingCard listing={makeListing()} now={Date.now()} onPress={() => {}} />,
		);
		expect(getByText(/Contains gluten and dairy/)).toBeTruthy();
	});

	it("shows the dietary tags", () => {
		const { getByText } = render(
			<ListingCard listing={makeListing()} now={Date.now()} onPress={() => {}} />,
		);
		expect(getByText("vegetarian")).toBeTruthy();
	});

	it("fires onPress when tapped", () => {
		const onPress = jest.fn();
		// The card now also contains a bookmark button, so target the card by its
		// label rather than the ambiguous role.
		const { getByLabelText } = render(
			<ListingCard listing={makeListing()} now={Date.now()} onPress={onPress} />,
		);
		fireEvent.press(getByLabelText(/Leftover pizza/));
		expect(onPress).toHaveBeenCalledTimes(1);
	});
});
