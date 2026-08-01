import { AuthScreen } from "@/screens/AuthScreen";

/**
 * Sign up. The same screen as /login, opened on the create-account tab — the
 * route is kept so existing links (and the auth gate) still resolve.
 */
export default function RegisterScreen() {
	return <AuthScreen initialMode="register" />;
}
