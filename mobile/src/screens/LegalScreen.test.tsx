import { fireEvent, render, screen } from "@testing-library/react-native";
import { LegalScreen } from "./LegalScreen";

const mockBack = jest.fn();
let mockDoc = "terms";
jest.mock("expo-router", () => ({
	useRouter: () => ({ back: mockBack }),
	useLocalSearchParams: () => ({ doc: mockDoc }),
}));

describe("LegalScreen", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockDoc = "terms";
	});

	it.each([
		["terms", "Who can use this app"],
		["safety", "Allergies and dietary needs"],
		["privacy", "What we collect"],
	])("renders the %s document", (doc, heading) => {
		mockDoc = doc;
		render(<LegalScreen />);
		expect(screen.getByText(heading)).toBeTruthy();
	});

	it("says so plainly when the document doesn't exist", () => {
		// An unknown key should read as a missing page, not an empty one that
		// looks like a rendering failure.
		mockDoc = "cookies";
		render(<LegalScreen />);
		expect(screen.getByText("That document isn't available.")).toBeTruthy();
	});

	it("offers a way back to the settings list", () => {
		render(<LegalScreen />);
		fireEvent.press(screen.getByLabelText("Back to settings"));
		expect(mockBack).toHaveBeenCalled();
	});
});
