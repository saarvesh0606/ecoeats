import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import {
	authErrorMessage,
	registerWithEmail,
	signInWithEmail,
	signInWithGoogle,
} from "@/lib/firebase";
import { AuthScreen } from "./AuthScreen";

jest.mock("@/lib/firebase", () => ({
	signInWithEmail: jest.fn(),
	registerWithEmail: jest.fn(),
	signInWithGoogle: jest.fn(),
	authErrorMessage: jest.fn(() => "That didn't work."),
	googleSignInSupported: true,
}));

const mockDevSignIn = jest.fn();
jest.mock("@/context/AuthContext", () => ({
	useAuth: () => ({ devSignIn: mockDevSignIn }),
}));

const mockSignIn = signInWithEmail as jest.MockedFunction<
	typeof signInWithEmail
>;
const mockRegister = registerWithEmail as jest.MockedFunction<
	typeof registerWithEmail
>;
const mockGoogle = signInWithGoogle as jest.MockedFunction<
	typeof signInWithGoogle
>;
const mockErrorMessage = authErrorMessage as jest.MockedFunction<
	typeof authErrorMessage
>;

function type(label: string | RegExp, value: string) {
	fireEvent.changeText(screen.getByLabelText(label), value);
}

describe("AuthScreen", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSignIn.mockResolvedValue(undefined as never);
		mockRegister.mockResolvedValue(undefined as never);
		mockGoogle.mockResolvedValue(undefined as never);
		mockErrorMessage.mockReturnValue("That didn't work.");
	});

	describe("the mode toggle", () => {
		it("starts on sign in", () => {
			render(<AuthScreen />);
			expect(screen.getByText("Sign in")).toBeTruthy();
			expect(screen.queryByLabelText("Full name")).toBeNull();
		});

		it("can be opened straight onto the register form", () => {
			render(<AuthScreen initialMode="register" />);
			expect(screen.getByText("Create account")).toBeTruthy();
			expect(screen.getByLabelText("Full name")).toBeTruthy();
		});

		it("keeps a typed email across the switch", () => {
			// The whole point of merging the two screens: correcting a wrong guess
			// about whether you already have an account must not cost you the form.
			render(<AuthScreen />);
			type("ASU email", "sun.devil@asu.edu");

			fireEvent.press(screen.getByText("Create Account"));

			expect(screen.getByLabelText("ASU email").props.value).toBe(
				"sun.devil@asu.edu",
			);
		});

		it("drops an error from the other form when switching", () => {
			render(<AuthScreen />);
			type("ASU email", "someone@gmail.com");
			fireEvent.press(screen.getByText("Sign in"));
			expect(screen.getByText(/use your @asu.edu email/)).toBeTruthy();

			fireEvent.press(screen.getByText("Create Account"));

			expect(screen.queryByText(/use your @asu.edu email/)).toBeNull();
		});
	});

	describe("validation", () => {
		it("refuses a non-ASU address without calling Firebase", () => {
			render(<AuthScreen />);
			type("ASU email", "someone@gmail.com");
			type("Password", "hunter22");

			fireEvent.press(screen.getByText("Sign in"));

			expect(screen.getByText(/use your @asu.edu email/)).toBeTruthy();
			expect(mockSignIn).not.toHaveBeenCalled();
		});

		it("refuses an empty email", () => {
			render(<AuthScreen />);
			fireEvent.press(screen.getByText("Sign in"));
			expect(screen.getByText("Email is required.")).toBeTruthy();
			expect(mockSignIn).not.toHaveBeenCalled();
		});

		it("enforces a password length only when registering", () => {
			render(<AuthScreen initialMode="register" />);
			type("ASU email", "sun.devil@asu.edu");
			type("Password", "short");

			fireEvent.press(screen.getByText("Create account"));

			expect(
				screen.getByText("Password must be at least 6 characters."),
			).toBeTruthy();
			expect(mockRegister).not.toHaveBeenCalled();
		});

		it("does not second-guess an existing password on sign in", async () => {
			// An account made before the rule changed still has to be able to log in.
			render(<AuthScreen />);
			type("ASU email", "sun.devil@asu.edu");
			type("Password", "short");

			fireEvent.press(screen.getByText("Sign in"));

			await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
		});
	});

	describe("submitting", () => {
		it("normalises the address before sending it", async () => {
			render(<AuthScreen />);
			type("ASU email", "  Sun.Devil@ASU.edu  ");
			type("Password", "hunter22");

			fireEvent.press(screen.getByText("Sign in"));

			await waitFor(() =>
				expect(mockSignIn).toHaveBeenCalledWith(
					"sun.devil@asu.edu",
					"hunter22",
				),
			);
		});

		it("passes the full name through on sign-up", async () => {
			// The name seeds the Firebase displayName, so role selection doesn't ask
			// for it a second time — it is not a decorative field.
			render(<AuthScreen initialMode="register" />);
			type("Full name", "  Sun Devil  ");
			type("ASU email", "sun.devil@asu.edu");
			type("Password", "hunter22");

			fireEvent.press(screen.getByText("Create account"));

			await waitFor(() =>
				expect(mockRegister).toHaveBeenCalledWith(
					"sun.devil@asu.edu",
					"hunter22",
					"Sun Devil",
				),
			);
		});

		it("sends no name when the field was left blank", async () => {
			render(<AuthScreen initialMode="register" />);
			type("ASU email", "sun.devil@asu.edu");
			type("Password", "hunter22");

			fireEvent.press(screen.getByText("Create account"));

			await waitFor(() =>
				expect(mockRegister).toHaveBeenCalledWith(
					"sun.devil@asu.edu",
					"hunter22",
					undefined,
				),
			);
		});

		it("translates a Firebase failure into something readable", async () => {
			mockSignIn.mockRejectedValue({ code: "auth/wrong-password" });
			mockErrorMessage.mockReturnValue("Wrong email or password.");

			render(<AuthScreen />);
			type("ASU email", "sun.devil@asu.edu");
			type("Password", "hunter22");
			fireEvent.press(screen.getByText("Sign in"));

			expect(await screen.findByText("Wrong email or password.")).toBeTruthy();
		});
	});

	// The flow itself lives in GoogleSignInButton and is tested there. What this
	// screen decides is only whether to show the button at all.
	describe("Google", () => {
		it("offers Google when the platform supports it", () => {
			render(<AuthScreen />);
			expect(screen.getByText("Continue with Google")).toBeTruthy();
		});
	});
});
