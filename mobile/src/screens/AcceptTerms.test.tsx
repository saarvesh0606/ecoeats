import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
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

/** Scrolling whichever document is on screen to its bottom, which unlocks the
 *  button for that step. Anchored on a heading unique to each document. */
function scrollToEnd(anchor: string) {
	fireEvent.scroll(screen.getByText(anchor), {
		nativeEvent: {
			contentOffset: { y: 2000 },
			contentSize: { height: 2000, width: 400 },
			layoutMeasurement: { height: 600, width: 400 },
		},
	});
}

/** Walk the whole gate: read the terms, advance, read the safety document. */
function readBothDocuments() {
	scrollToEnd("Who can use this app");
	fireEvent.press(screen.getByText("Next"));
	scrollToEnd("You decide what is safe to eat");
}

describe("AcceptTerms", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockAccept.mockResolvedValue({ terms_current: true } as never);
	});

	it("opens on the terms", () => {
		render(<AcceptTerms />);
		expect(screen.getByText("Who can use this app")).toBeTruthy();
	});

	it("won't advance past the terms until they've been read to the end", () => {
		render(<AcceptTerms />);

		fireEvent.press(screen.getByText("Next"));

		// Still on the first document.
		expect(screen.getByText("Who can use this app")).toBeTruthy();
		expect(screen.queryByText("You decide what is safe to eat")).toBeNull();
	});

	it("shows the food safety document as the second step", () => {
		// The part that actually matters for a food app, and a link is a thing
		// people don't open — so it's a required step, not a footnote.
		render(<AcceptTerms />);
		scrollToEnd("Who can use this app");
		fireEvent.press(screen.getByText("Next"));

		expect(screen.getByText("Allergies and dietary needs")).toBeTruthy();
	});

	it("won't let anyone agree before reading the safety document", () => {
		render(<AcceptTerms />);
		scrollToEnd("Who can use this app");
		fireEvent.press(screen.getByText("Next"));

		fireEvent.press(screen.getByText("Accept and continue"));

		expect(mockAccept).not.toHaveBeenCalled();
		expect(screen.getByText(/Scroll to the end of/)).toBeTruthy();
	});

	it("does not carry one document's scroll gate onto the next", () => {
		// The bug this flow replaced: both documents shared a scroll container,
		// so reaching the end of the terms satisfied the safety gate too.
		render(<AcceptTerms />);
		scrollToEnd("Who can use this app");
		fireEvent.press(screen.getByText("Next"));

		expect(screen.getByText(/Scroll to the end of/)).toBeTruthy();
	});

	it("records acceptance once both documents have been read", async () => {
		render(<AcceptTerms />);
		readBothDocuments();

		fireEvent.press(screen.getByText("Accept and continue"));

		await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(mockCompleteTerms).toHaveBeenCalled());
	});

	it("lets the reader go back without losing what they've read", () => {
		render(<AcceptTerms />);
		readBothDocuments();

		fireEvent.press(screen.getByText("Back"));
		expect(screen.getByText("Who can use this app")).toBeTruthy();

		// Already read, so it advances again without re-scrolling.
		fireEvent.press(screen.getByText("Next"));
		expect(screen.getByText("You decide what is safe to eat")).toBeTruthy();
	});

	it("keeps the user here when the server rejects it", async () => {
		// Failing quietly would drop somebody into the app having accepted
		// nothing, which is the one outcome this screen exists to prevent.
		mockAccept.mockRejectedValue(new Error("offline"));
		render(<AcceptTerms />);
		readBothDocuments();

		fireEvent.press(screen.getByText("Accept and continue"));

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
