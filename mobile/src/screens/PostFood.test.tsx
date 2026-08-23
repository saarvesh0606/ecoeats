import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { createListing } from "@/lib/listings";
import { uploadPhoto } from "@/lib/uploads";
import { makeListing } from "@/test-utils/fixtures";
import { PostFood } from "./PostFood";

jest.mock("@/lib/api", () =>
	jest.requireActual("@/test-utils/render").apiModuleMock(),
);
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
jest.mock("expo-location", () => ({ Accuracy: { Balanced: 3, High: 4 } }));

const mockRequestLocation = jest.fn();
jest.mock("@/hooks/useDeviceLocation", () => ({
	useDeviceLocation: () => ({
		coords: null,
		status: "idle",
		request: mockRequestLocation,
	}),
}));
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
jest.mock("expo-router", () => ({
	useRouter: () => ({ replace: mockReplace }),
}));

// The app's own dialog, not Alert or window.confirm — see ConfirmDialog, which
// exists because a browser dialog blocks the JS thread and can't carry the
// product's voice. Tests decide its answer.
const mockConfirm = jest.fn(async () => true);
jest.mock("@/components/ui/ConfirmDialog", () => ({
	useConfirm: () => mockConfirm,
}));

const mockCreate = createListing as jest.MockedFunction<typeof createListing>;
const mockUpload = uploadPhoto as jest.MockedFunction<typeof uploadPhoto>;
const mockPick = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
	typeof ImagePicker.launchImageLibraryAsync
>;

/** Fills every required field so a test can focus on one thing at a time. */
function fillRequired(overrides: Partial<Record<string, string>> = {}) {
	fireEvent.changeText(
		screen.getByLabelText("Title"),
		overrides.title ?? "Pizza",
	);
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
		// clearAllMocks resets calls, not implementations, so a test that makes
		// the host back out would otherwise leak into every test after it.
		mockConfirm.mockResolvedValue(true);
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

	describe("where the food is", () => {
		it("pins the post to the host's actual position once they ask it to", async () => {
			// The campus-centre fallback is covered by the publishing suite above;
			// this is the case that makes a feed distance mean anything.
			mockRequestLocation.mockResolvedValue({ lat: 33.4212, lng: -111.9327 });
			render(<PostFood />);
			fillRequired();
			setDescription("Cheese and pepperoni");

			fireEvent.press(screen.getByText("Pin my location"));
			await screen.findByText("Location pinned — tap to update");
			fireEvent.press(screen.getByText("Publish Post"));

			await waitFor(() =>
				expect(mockCreate).toHaveBeenCalledWith(
					expect.objectContaining({
						location: expect.objectContaining({
							lat: 33.4212,
							lng: -111.9327,
						}),
					}),
				),
			);
		});

		it("still publishes, at the campus centre, when location is refused", async () => {
			// A refused permission must never block a post going up.
			mockRequestLocation.mockResolvedValue(null);
			render(<PostFood />);
			fillRequired();
			setDescription("Cheese and pepperoni");

			fireEvent.press(screen.getByText("Pin my location"));
			await waitFor(() => expect(mockRequestLocation).toHaveBeenCalled());
			fireEvent.press(screen.getByText("Publish Post"));

			await waitFor(() =>
				expect(mockCreate).toHaveBeenCalledWith(
					expect.objectContaining({
						location: expect.objectContaining({ lat: 33.4242 }),
					}),
				),
			);
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

	describe("photos", () => {
		/** Pick and upload one photo, resolving once its thumbnail is on screen. */
		async function addPhoto(url: string) {
			mockPick.mockResolvedValue({
				canceled: false,
				assets: [{ uri: `file:///${url}` }],
			} as never);
			mockUpload.mockResolvedValue(url);
			fireEvent.press(screen.getByText("+ Add"));
			await screen.findByLabelText(`Remove photo`);
		}

		it("takes a photo back off the post", async () => {
			// Adding one used to be final: there was no way to swap a wrong photo
			// for the right one short of abandoning the post.
			render(<PostFood />);
			await addPhoto("https://cdn.test/one.jpg");

			fireEvent.press(screen.getByLabelText("Remove photo"));

			await waitFor(() =>
				expect(screen.queryByLabelText("Remove photo")).toBeNull(),
			);
		});

		it("doesn't post a photo that was removed", async () => {
			render(<PostFood />);
			await addPhoto("https://cdn.test/one.jpg");
			fireEvent.press(screen.getByLabelText("Remove photo"));
			await waitFor(() =>
				expect(screen.queryByLabelText("Remove photo")).toBeNull(),
			);

			fillRequired();
			setDescription("Cheese and pepperoni");
			fireEvent.press(screen.getByText("Publish Post"));

			await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
			expect(mockCreate.mock.calls[0][0].photo_urls).toEqual([]);
		});
	});

	describe("clearing the form", () => {
		it("offers nothing to clear on an untouched form", () => {
			render(<PostFood />);
			expect(screen.queryByLabelText("Clear this post")).toBeNull();
		});

		it("asks before discarding anything", () => {
			render(<PostFood />);
			fillRequired();

			fireEvent.press(screen.getByLabelText("Clear this post"));

			expect(mockConfirm).toHaveBeenCalledWith(
				expect.objectContaining({ title: "Clear this post?" }),
			);
		});

		it("discards everything once confirmed", async () => {
			mockConfirm.mockResolvedValue(true);
			render(<PostFood />);
			fillRequired();

			fireEvent.press(screen.getByLabelText("Clear this post"));

			await waitFor(() =>
				expect(screen.getByLabelText("Title").props.value).toBe(""),
			);
			expect(screen.getByLabelText("Building").props.value).toBe("");
			// Nothing left to lose, so the control retires itself.
			expect(screen.queryByLabelText("Clear this post")).toBeNull();
		});

		it("keeps the form when the host backs out", async () => {
			// A long form behind a stray tap: the confirm has to actually mean it.
			mockConfirm.mockResolvedValue(false);
			render(<PostFood />);
			fillRequired();

			fireEvent.press(screen.getByLabelText("Clear this post"));

			await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
			expect(screen.getByLabelText("Title").props.value).toBe("Pizza");
		});
	});
});
