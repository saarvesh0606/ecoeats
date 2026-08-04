import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { createListing } from "@/lib/listings";
import { makeListing } from "@/test-utils/fixtures";
import { PostFood } from "./PostFood";

jest.mock("@/lib/api", () => jest.requireActual("@/test-utils/render").apiModuleMock());
jest.mock("@/lib/listings", () => ({
	createListing: jest.fn(),
	DIETARY_TAGS: ["vegetarian", "vegan", "halal", "kosher", "gluten-free"],
	EXPIRY_CHOICES: [15, 20, 30, 45, 60],
	CAMPUSES: {
		Tempe: { lat: 33.4242, lng: -111.9281 },
		Downtown: { lat: 33.4517, lng: -112.0741 },
	},
}));
jest.mock("@/lib/uploads", () => ({ uploadPhoto: jest.fn() }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock("@/hooks/useSpeech", () => ({
	useSpeech: () => ({
		supported: false,
		listening: false,
		start: jest.fn(),
		stop: jest.fn(),
		error: null,
	}),
}));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockCreate = createListing as jest.MockedFunction<typeof createListing>;

/** Fills every required field so a test can focus on one thing at a time. */
function fillRequired(overrides: Partial<Record<string, string>> = {}) {
	fireEvent.changeText(screen.getByLabelText("Title"), overrides.title ?? "Pizza");
	fireEvent.changeText(
		screen.getByLabelText("Feeds how many?"),
		overrides.quantity ?? "12",
	);
	fireEvent.changeText(
		screen.getByLabelText("Building"),
		overrides.building ?? "Wrigley Hall",
	);
}

/** The description box carries no label — it sits under the voice panel and is
 *  identified by its placeholder, which is the plain one while speech is
 *  unsupported (as in this suite's useSpeech mock). */
function setDescription(text: string) {
	fireEvent.changeText(
		screen.getByPlaceholderText("What is it? Describe the food."),
		text,
	);
}

describe("PostFood", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCreate.mockResolvedValue(makeListing());
	});

	describe("validation", () => {
		it("asks for a title first", () => {
			render(<PostFood />);
			fireEvent.press(screen.getByText("Publish Post"));

			expect(screen.getByText("Give the food a short title.")).toBeTruthy();
			expect(mockCreate).not.toHaveBeenCalled();
		});

		it("asks for a description", () => {
			render(<PostFood />);
			fillRequired();
			fireEvent.press(screen.getByText("Publish Post"));

			expect(screen.getByText("Describe the food.")).toBeTruthy();
			expect(mockCreate).not.toHaveBeenCalled();
		});

		it("rejects a quantity that isn't a whole number of people", () => {
			render(<PostFood />);
			fillRequired({ quantity: "2.5" });
			setDescription("Cheese and pepperoni");
			fireEvent.press(screen.getByText("Publish Post"));

			expect(screen.getByText("How many people does it feed?")).toBeTruthy();
			expect(mockCreate).not.toHaveBeenCalled();
		});

		it("rejects a quantity of zero", () => {
			render(<PostFood />);
			fillRequired({ quantity: "0" });
			setDescription("Cheese and pepperoni");
			fireEvent.press(screen.getByText("Publish Post"));

			expect(screen.getByText("How many people does it feed?")).toBeTruthy();
		});

		it("insists on a building, since nobody can collect without one", () => {
			render(<PostFood />);
			fillRequired({ building: "  " });
			setDescription("Cheese and pepperoni");
			fireEvent.press(screen.getByText("Publish Post"));

			expect(screen.getByText("Which building is it in?")).toBeTruthy();
			expect(mockCreate).not.toHaveBeenCalled();
		});
	});

	describe("publishing", () => {
		function fillValidForm() {
			fillRequired();
			setDescription("Cheese and pepperoni");
		}

		it("posts the trimmed form with the campus coordinates attached", async () => {
			render(<PostFood />);
			fillValidForm();

			fireEvent.press(screen.getByText("Publish Post"));

			await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "Pizza",
					description: "Cheese and pepperoni",
					quantity_total: 12,
					publish: "now",
					location: expect.objectContaining({
						campus: "Tempe",
						building: "Wrigley Hall",
						lat: 33.4242,
						lng: -111.9281,
					}),
				}),
			);
		});

		it("defaults to a 30 minute window", async () => {
			render(<PostFood />);
			fillValidForm();
			fireEvent.press(screen.getByText("Publish Post"));

			await waitFor(() =>
				expect(mockCreate).toHaveBeenCalledWith(
					expect.objectContaining({ expiry_minutes: 30 }),
				),
			);
		});

		it("takes a different expiry when one is chosen", async () => {
			render(<PostFood />);
			fillValidForm();
			fireEvent.press(screen.getByText("15m"));
			fireEvent.press(screen.getByText("Publish Post"));

			await waitFor(() =>
				expect(mockCreate).toHaveBeenCalledWith(
					expect.objectContaining({ expiry_minutes: 15 }),
				),
			);
		});

		it("sends the dietary tags that were selected", async () => {
			render(<PostFood />);
			fillValidForm();
			fireEvent.press(screen.getByText("vegetarian"));
			fireEvent.press(screen.getByText("Publish Post"));

			await waitFor(() =>
				expect(mockCreate).toHaveBeenCalledWith(
					expect.objectContaining({ dietary_tags: ["vegetarian"] }),
				),
			);
		});

		it("sends optional fields as null rather than empty strings", async () => {
			// The API distinguishes "not given" from "given as blank"; posting "" for
			// a room would render as an empty line on the pickup card.
			render(<PostFood />);
			fillValidForm();
			fireEvent.press(screen.getByText("Publish Post"));

			await waitFor(() =>
				expect(mockCreate).toHaveBeenCalledWith(
					expect.objectContaining({
						allergens: null,
						location: expect.objectContaining({
							room: null,
							placement_note: null,
						}),
					}),
				),
			);
		});

		it("saves a draft instead of going live", async () => {
			render(<PostFood />);
			fillValidForm();

			fireEvent.press(screen.getByText("Save as Draft"));

			await waitFor(() =>
				expect(mockCreate).toHaveBeenCalledWith(
					expect.objectContaining({ publish: "draft", scheduled_for: null }),
				),
			);
		});

		it("lands on the dashboard once posted", async () => {
			render(<PostFood />);
			fillValidForm();
			fireEvent.press(screen.getByText("Publish Post"));

			await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/posts"));
		});

		it("surfaces the server's reason and stays on the form", async () => {
			const { ApiError } = jest.requireMock("@/lib/api");
			mockCreate.mockRejectedValue(new ApiError(429, "Slow down a moment."));

			render(<PostFood />);
			fillValidForm();
			fireEvent.press(screen.getByText("Publish Post"));

			expect(await screen.findByText("Slow down a moment.")).toBeTruthy();
			expect(mockReplace).not.toHaveBeenCalled();
		});
	});

	describe("scheduling", () => {
		it("switches the button once a later time is picked", () => {
			render(<PostFood />);
			fireEvent.press(screen.getByText("In 1 hour"));
			expect(screen.getByText("Schedule Post")).toBeTruthy();
			expect(screen.queryByText("Publish Post")).toBeNull();
		});

		it("sends a go-live time when scheduled", async () => {
			render(<PostFood />);
			fillRequired();
			setDescription("Cheese and pepperoni");
			fireEvent.press(screen.getByText("In 1 hour"));

			fireEvent.press(screen.getByText("Schedule Post"));

			await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
			const body = mockCreate.mock.calls[0][0];
			expect(body.publish).toBe("scheduled");
			expect(typeof body.scheduled_for).toBe("string");
		});
	});
});
