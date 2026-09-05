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

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
	useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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
			type("Email", "sam.rivera@gmail.com");

			fireEvent.press(screen.getByText("Create Account"));

			expect(screen.getByLabelText("Email").props.value).toBe(
				"sam.rivera@gmail.com",
			);
		});

		it("clears a typed password across the switch", () => {
			// The email survives, the password does not: on the register tab that
			// field is choosing a password rather than proving an identity.
			render(<AuthScreen />);
			type("Email", "sam.rivera@gmail.com");
			type("Password", "hunter2-old");
			
			fireEvent.press(screen.getByText("Create Account"));
			
			expect(screen.getByLabelText("Email").props.value).toBe(
				"sam.rivera@gmail.com",
			);
			expect(screen.getByLabelText("Password").props.value).toBe("");
		});

		it("drops an error from the other form when switching", () => {
			render(<AuthScreen />);
			type("Email", "not-an-email");
			fireEvent.press(screen.getByText("Sign in"));
			expect(screen.getByText(/doesn't look right/)).toBeTruthy();

			fireEvent.press(screen.getByText("Create Account"));

			expect(screen.queryByText(/doesn't look right/)).toBeNull();
		});
	});

	describe("validation", () => {
		it("refuses a malformed address without calling Firebase", () => {
			render(<AuthScreen />);
			type("Email", "someone-at-gmail.com");
			type("Password", "hunter22");

			fireEvent.press(screen.getByText("Sign in"));

			expect(screen.getByText(/doesn't look right/)).toBeTruthy();
			expect(mockSignIn).not.toHaveBeenCalled();
		});

		it("accepts an ordinary consumer address", () => {
			// The domain rule is gone: a gmail account is what the app now
			// expects, and Apple's relay addresses must get through too.
			render(<AuthScreen />);
			type("Email", "someone@gmail.com");
			type("Password", "hunter22");

			fireEvent.press(screen.getByText("Sign in"));

			expect(mockSignIn).toHaveBeenCalled();
		});

		it("refuses an empty email", () => {
			render(<AuthScreen />);
			fireEvent.press(screen.getByText("Sign in"));
			expect(screen.getByText("Email is required.")).toBeTruthy();
			expect(mockSignIn).not.toHaveBeenCalled();
		});

		it("enforces a password length only when registering", () => {
			render(<AuthScreen initialMode="register" />);
			type("Email", "sam.rivera@gmail.com");
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
			type("Email", "sam.rivera@gmail.com");
			type("Password", "short");

			fireEvent.press(screen.getByText("Sign in"));

			await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
		});
	});

	describe("submitting", () => {
		it("normalises the address before sending it", async () => {
			render(<AuthScreen />);
			type("Email", "  Sam.Rivera@GMAIL.com  ");
			type("Password", "hunter22");

			fireEvent.press(screen.getByText("Sign in"));

			await waitFor(() =>
				expect(mockSignIn).toHaveBeenCalledWith(
					"sam.rivera@gmail.com",
					"hunter22",
				),
			);
		});

		it("passes the full name through on sign-up", async () => {
			// The name seeds the Firebase displayName, so role selection doesn't ask
			// for it a second time — it is not a decorative field.
			render(<AuthScreen initialMode="register" />);
			type("Full name", "  Sam Rivera  ");
			type("Email", "sam.rivera@gmail.com");
			type("Password", "hunter22");

			fireEvent.press(screen.getByText("Create account"));

			await waitFor(() =>
				expect(mockRegister).toHaveBeenCalledWith(
					"sam.rivera@gmail.com",
					"hunter22",
					"Sam Rivera",
				),
			);
		});

		it("sends no name when the field was left blank", async () => {
			render(<AuthScreen initialMode="register" />);
			type("Email", "sam.rivera@gmail.com");
			type("Password", "hunter22");

			fireEvent.press(screen.getByText("Create account"));

			await waitFor(() =>
				expect(mockRegister).toHaveBeenCalledWith(
					"sam.rivera@gmail.com",
					"hunter22",
					undefined,
				),
			);
		});

		it("translates a Firebase failure into something readable", async () => {
			mockSignIn.mockRejectedValue({ code: "auth/wrong-password" });
			mockErrorMessage.mockReturnValue("Wrong email or password.");

			render(<AuthScreen />);
			type("Email", "sam.rivera@gmail.com");
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

	describe("the forgotten-password way out", () => {
		it("is offered on the sign-in tab", () => {
			render(<AuthScreen />);
			expect(screen.getByText("Forgot your password?")).toBeTruthy();
		});

		it("is not offered on the register tab", () => {
			// There is no password to have forgotten for an account that does not
			// exist yet.
			render(<AuthScreen initialMode="register" />);
			expect(screen.queryByText("Forgot your password?")).toBeNull();
		});

		it("carries the typed address over, so it isn't typed twice", () => {
			render(<AuthScreen />);
			type("Email", "  Sam.Rivera@gmail.com  ");
			fireEvent.press(screen.getByText("Forgot your password?"));

			expect(mockPush).toHaveBeenCalledWith({
				pathname: "/forgot-password",
				params: { email: "Sam.Rivera@gmail.com" },
			});
		});

		it("goes there with nothing when nothing was typed", () => {
			render(<AuthScreen />);
			fireEvent.press(screen.getByText("Forgot your password?"));

			expect(mockPush).toHaveBeenCalledWith("/forgot-password");
		});
	});
});
