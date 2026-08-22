import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { acceptTerms } from "@/lib/api";
import { AcceptTerms } from "./AcceptTerms";

jest.mock("@/lib/api", () => ({
	...jest.requireActual("@/test-utils/render").apiModuleMock(),
	acceptTerms: jest.fn(),
}));

const mockCompleteTerms = jest.fn();
const mockSignOut = jest.fn();
jest.mock("@/context/AuthContext", () => ({
	useAuth: () => ({
		completeTerms: mockCompleteTerms,
		signOut: mockSignOut,
	}),
}));

const mockAccept = acceptTerms as jest.MockedFunction<typeof acceptTerms>;

/** The safety tab, by role — "Food safety" is also a heading inside the terms,
 *  so matching on text alone finds two nodes. */
function safetyTab() {
	return screen.getAllByRole("tab")[1];
}

/** Scrolling the safety document to the bottom, which is what unlocks it. */
function readSafetyToEnd() {
	fireEvent.press(safetyTab());
	fireEvent.scroll(screen.getByText("You decide what is safe to eat"), {
		nativeEvent: {
			contentOffset: { y: 2000 },
			contentSize: { height: 2000, width: 400 },
			layoutMeasurement: { height: 600, width: 400 },
		},
	});
}

describe("AcceptTerms", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockAccept.mockResolvedValue({ terms_current: true } as never);
	});

	it("opens on the terms", () => {
		render(<AcceptTerms />);
		expect(screen.getByText("Who can use EcoEats")).toBeTruthy();
	});

	it("shows the food safety document too", () => {
		// The part that actually matters for a food app, and a link is a thing
		// people don't open — so it's a tab, not a footnote.
		render(<AcceptTerms />);
		fireEvent.press(safetyTab());
		expect(screen.getByText("Allergies and dietary needs")).toBeTruthy();
	});

	it("won't let anyone agree before reading the safety document", () => {
		render(<AcceptTerms />);

		fireEvent.press(screen.getByText("I agree"));

		expect(mockAccept).not.toHaveBeenCalled();
		expect(screen.getByText(/read to the end to continue/)).toBeTruthy();
	});

	it("records acceptance once the safety document has been read", async () => {
		render(<AcceptTerms />);
		readSafetyToEnd();

		fireEvent.press(screen.getByText("I agree"));

		await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(mockCompleteTerms).toHaveBeenCalled());
	});

	it("keeps the user here when the server rejects it", async () => {
		// Failing quietly would drop somebody into the app having accepted
		// nothing, which is the one outcome this screen exists to prevent.
		mockAccept.mockRejectedValue(new Error("offline"));
		render(<AcceptTerms />);
		readSafetyToEnd();

		fireEvent.press(screen.getByText("I agree"));

		expect(await screen.findByText(/Couldn't record that/)).toBeTruthy();
		expect(mockCompleteTerms).not.toHaveBeenCalled();
	});

	it("offers a way out that isn't agreeing", async () => {
		// There is no skip and no back — the router sends you straight back. So
		// signing out has to be reachable, or declining means being stuck.
		render(<AcceptTerms />);

		fireEvent.press(screen.getByText("Sign out"));

		await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
	});
});
