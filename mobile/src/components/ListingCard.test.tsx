import { fireEvent, render } from "@testing-library/react-native";
import type { Listing } from "@/lib/listings";
import { ListingCard } from "./ListingCard";

// ListingCard imports save/unsave from @/lib/listings, which pulls in the API
// client (and Firebase) at load. Stub the API so the card renders in isolation
// without a real Firebase/env setup.
jest.mock("@/lib/api", () => ({
	api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), del: jest.fn() },
}));

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
		scheduled_for: null,
		organizer: { id: "org-1", name: "Front Desk", rating: null, rating_count: 0 },
		photo_urls: [],
		distance_miles: null,
		seconds_remaining: 1800,
		is_claimable: true,
		is_saved: false,
		interested_count: 0,
		...overrides,
	};
}

describe("ListingCard", () => {
	// Profile has always said dietary preferences "highlight food that fits".
	// Nothing read the setting until now, so the toggles genuinely did nothing.
	describe("dietary preferences", () => {
		it("says so on the card when the food matches", () => {
			const { getByLabelText } = render(
				<ListingCard
					listing={makeListing({ dietary_tags: ["vegetarian", "halal"] })}
					now={Date.now()}
					onPress={() => {}}
					prefs={["vegetarian"]}
				/>,
			);

			// The glow is a breathing border, which reaches neither a screen reader
			// nor anyone who can't separate the two greens — so the card says it.
			expect(
				getByLabelText(/Leftover pizza.*matches your preferences/),
			).toBeTruthy();
		});

		it("says nothing when no preferences are set", () => {
			const { queryByLabelText } = render(
				<ListingCard
					listing={makeListing({ dietary_tags: ["vegetarian"] })}
					now={Date.now()}
					onPress={() => {}}
				/>,
			);

			expect(queryByLabelText(/matches your preferences/)).toBeNull();
		});

		it("fills in the tag that matched, and only that one", () => {
			const { getByText } = render(
				<ListingCard
					listing={makeListing({ dietary_tags: ["vegetarian", "halal"] })}
					now={Date.now()}
					onPress={() => {}}
					prefs={["vegetarian"]}
				/>,
			);

			// The glow says the card is for you; the chip says which preference
			// made it so, which a card carrying three tags otherwise leaves unsaid.
			expect(getByText("vegetarian").props.className).toContain("forest");
			expect(getByText("halal").props.className).not.toContain("forest");
		});

		it("still shows food that matches nothing", () => {
			const { getByText } = render(
				<ListingCard
					listing={makeListing({ title: "Beef tacos", dietary_tags: ["halal"] })}
					now={Date.now()}
					onPress={() => {}}
					prefs={["vegan"]}
				/>,
			);

			// Marking, not filtering: this food expires within the hour, and hiding
			// it over a preference set once is the worse failure.
			expect(getByText("Beef tacos")).toBeTruthy();
		});
	});

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

	describe("how much is left", () => {
		it("shows the portions remaining", () => {
			const { getByText } = render(
				<ListingCard listing={makeListing()} now={Date.now()} onPress={() => {}} />,
			);
			expect(getByText("8 portions")).toBeTruthy();
		});

		it("says portion, singular, for the last one", () => {
			const { getByText } = render(
				<ListingCard
					listing={makeListing({ quantity_remaining: 1 })}
					now={Date.now()}
					onPress={() => {}}
				/>,
			);
			expect(getByText("1 portion")).toBeTruthy();
		});

		it("does not say 'left', which the countdown already owns", () => {
			// Two chips ending in the same word read as a pair of times, and the
			// accessibility label would run "30m left, 8 left".
			const { getByText, queryByText } = render(
				<ListingCard listing={makeListing()} now={Date.now()} onPress={() => {}} />,
			);
			expect(getByText("8 portions")).toBeTruthy();
			expect(queryByText("8 left")).toBeNull();
		});

		it("keeps the count off a card with nothing left", () => {
			// The server filters these out and SSE removes them, so this is a guard
			// against a "0 portions" chip flashing up mid-update.
			const { queryByText } = render(
				<ListingCard
					listing={makeListing({ quantity_remaining: 0 })}
					now={Date.now()}
					onPress={() => {}}
				/>,
			);
			expect(queryByText("0 portions")).toBeNull();
		});
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

	describe("accessibility", () => {
		// These run under jest-expo's default (iOS) platform, which is the point:
		// the role is deliberately native-only. Platform is NOT mocked to check the
		// web branch — mocking RN's Platform module breaks its own re-export
		// ("Cannot read properties of undefined (reading 'OS')").
		it("announces the card as a button, not as text", () => {
			// Without a role a screen reader reads the card out as plain text and
			// gives no indication the whole thing opens the listing.
			const { getByLabelText } = render(
				<ListingCard listing={makeListing()} now={Date.now()} onPress={() => {}} />,
			);
			const card = getByLabelText(/Leftover pizza/);
			expect(card.props.accessibilityRole).toBe("button");
			expect(card.props.accessibilityHint).toBe("Opens the listing");
		});

		it("keeps the bookmark a separate control with its own label", () => {
			// The nesting is the reason the role was withheld everywhere before. On
			// native both must stay independently focusable, so this pins that the
			// card's label never swallows the bookmark's.
			const { getByLabelText } = render(
				<ListingCard listing={makeListing()} now={Date.now()} onPress={() => {}} />,
			);
			expect(getByLabelText("Save for later")).toBeTruthy();
		});

		it("reads the time and the amount left in the label", () => {
			const { getByLabelText } = render(
				<ListingCard listing={makeListing()} now={Date.now()} onPress={() => {}} />,
			);
			expect(getByLabelText(/Leftover pizza, 30m left, 8 portions/)).toBeTruthy();
		});
	});
});
