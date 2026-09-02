import { useCallback, useEffect, useState } from "react";
import { SettingsGroup, SettingsRow } from "@/components/ui/SettingsList";
import {
	APPLE_CANCELLED,
	appleSignInAvailable,
	requestAppleCredential,
} from "@/lib/appleAuth";
import {
	APPLE_PROVIDER,
	appleCredential,
	authErrorMessage,
	GOOGLE_PROVIDER,
	linkCredential,
	linkedProviders,
	PASSWORD_PROVIDER,
} from "@/lib/firebase";

const LABELS: Record<string, string> = {
	[APPLE_PROVIDER]: "Apple",
	[GOOGLE_PROVIDER]: "Google",
	[PASSWORD_PROVIDER]: "Email and password",
};

/**
 * The ways in to this account, and how to add one.
 *
 * Why this exists: Sign in with Apple's "Hide My Email" issues a relay address
 * that deliberately cannot be matched to the person's real one. So someone who
 * signs in with Apple and later with Google looks like two different people and
 * gets two EcoEats accounts, each with its own listings and claims and no way
 * to tell they belong to one person. Apple designed the relay to be unlinkable;
 * no amount of guessing on our side can undo that.
 *
 * Linking is the answer, and it has to happen from *inside* the account you
 * mean to keep: `linkWithCredential` attaches a provider to the CURRENT user
 * and leaves the uid — which is our `User.id` — alone. The account and
 * everything in it is untouched and simply gains another door.
 */
export function SignInMethods({
	onError,
	onLinked,
}: {
	onError: (message: string | null) => void;
	onLinked: (label: string) => void;
}) {
	const [providers, setProviders] = useState<string[]>([]);
	const [appleAvailable, setAppleAvailable] = useState(false);
	const [linking, setLinking] = useState(false);

	const refresh = useCallback(() => setProviders(linkedProviders()), []);

	useEffect(() => {
		refresh();
		let alive = true;
		appleSignInAvailable().then((ok) => {
			if (alive) setAppleAvailable(ok);
		});
		return () => {
			alive = false;
		};
	}, [refresh]);

	const hasApple = providers.includes(APPLE_PROVIDER);

	async function linkApple() {
		onError(null);
		setLinking(true);
		try {
			const { identityToken, rawNonce } = await requestAppleCredential();
			await linkCredential(appleCredential(identityToken, rawNonce));
			refresh();
			onLinked("Apple");
		} catch (err) {
			const code =
				typeof err === "object" && err !== null && "code" in err
					? String((err as { code: unknown }).code)
					: "";
			if (code === APPLE_CANCELLED) return; // said no; say nothing back

			// The one failure worth explaining properly. That Apple ID is already
			// its own EcoEats account, possibly with its own listings and claims,
			// and nothing here can safely absorb it.
			if (code === "auth/credential-already-in-use") {
				onError(
					"That Apple ID already has its own EcoEats account. Sign in " +
						"with it directly, or delete it first and then link.",
				);
				return;
			}
			if (code === "auth/provider-already-linked") {
				refresh();
				return;
			}
			onError(
				err instanceof Error && !("code" in err)
					? err.message
					: authErrorMessage(err),
			);
		} finally {
			setLinking(false);
		}
	}

	return (
		<SettingsGroup title="Ways to sign in">
			{providers.map((id) => (
				<SettingsRow
					key={id}
					icon="checkmark-circle-outline"
					label={LABELS[id] ?? id}
					detail="Linked"
				/>
			))}

			{appleAvailable && !hasApple && (
				<SettingsRow
					icon="logo-apple"
					label={linking ? "Linking…" : "Link Apple"}
					subtitle="Sign in with Apple next time, on the same account."
					onPress={linking ? undefined : () => void linkApple()}
				/>
			)}
		</SettingsGroup>
	);
}
