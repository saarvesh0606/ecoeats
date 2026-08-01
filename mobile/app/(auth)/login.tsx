import { AuthScreen } from "@/screens/AuthScreen";

/** Sign in. Same screen as /register, opened on the sign-in tab. */
export default function LoginScreen() {
	return <AuthScreen initialMode="signin" />;
}
