"""Dev utility for Firebase accounts — testing without inbox access.

⚠️ DEVELOPMENT ONLY. Talks straight to Firebase with the project's service
account, so it bypasses the verification email entirely. That is the whole
point: an account can be made testable without waiting on a mail that may take
minutes to arrive, land in spam, or never come at all.

Why this exists: Firebase's built-in email sender gives you no delivery
visibility at all. `sendEmailVerification` reporting success only means Firebase
accepted the job — a mail gateway can quarantine it silently afterwards, with no
bounce. So "did the mail arrive?" and "does the app work?" are two separate
questions, and this answers the second one without waiting on the first.

Usage (from the repo root):

    python scripts/dev_account.py show    someone@gmail.com
    python scripts/dev_account.py link    someone@gmail.com
    python scripts/dev_account.py verify  someone@gmail.com
    python scripts/dev_account.py send    someone@gmail.com
    python scripts/dev_account.py delete  someone@gmail.com

  show    what Firebase knows: uid, whether the email is verified, created when
  link    mint the real verification link WITHOUT sending any email — open it in
          a browser to verify the account by hand
  verify  mark the email verified directly, skipping the link too
  send    the DELIVERY HARNESS — really send a verification email, the same one
          signup triggers, and time it. This is the only way to tell whether an
          SMTP change helped: run it, check the inbox AND the SMTP provider's
          own log, `delete`, change the config, run it again. It goes through
          the REST API on purpose — it walks the same path a real signup walks,
          without needing the app in front of you.
  delete  remove the account so the address can be signed up with again
          (Firebase refuses a repeat signup with "email already in use")

⚠️ The API demands a VERIFIED email. It no longer demands a particular domain
— that restriction is now the ALLOWED_EMAIL_DOMAIN setting and ships unset — so
an account made here is one the app will actually accept.
"""

from __future__ import annotations

import secrets
import sys
import time
from pathlib import Path

import firebase_admin
import requests
from firebase_admin import auth, credentials

_ROOT = Path(__file__).resolve().parent.parent
CREDENTIALS = _ROOT / "secrets" / "firebase-service-account.json"
ENV_FILE = _ROOT / "mobile" / ".env"
IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts"


def _connect() -> None:
    if not CREDENTIALS.exists():
        sys.exit(
            f"No service account at {CREDENTIALS}.\n"
            "Download it from Firebase Console → Project settings → Service "
            "accounts, and save it there (the folder is gitignored)."
        )
    firebase_admin.initialize_app(credentials.Certificate(str(CREDENTIALS)))


def _user(email: str):
    try:
        return auth.get_user_by_email(email)
    except auth.UserNotFoundError:
        sys.exit(
            f"No Firebase account for {email}. Sign up in the app first — this "
            "tool inspects existing accounts, it doesn't create them."
        )


def show(email: str) -> None:
    u = _user(email)
    print(f"email:    {u.email}")
    print(f"uid:      {u.uid}")
    print(f"verified: {u.email_verified}")
    print(f"name:     {u.display_name or '—'}")
    print(f"created:  {u.user_metadata.creation_timestamp}")
    if not u.email_verified:
        print("\nNot verified. Use `link` to get the URL, or `verify` to skip it.")


def link(email: str) -> None:
    _user(email)  # fail early with a clear message if it doesn't exist
    print(auth.generate_email_verification_link(email))
    print(
        "\nThis is the real link the email would have contained — Firebase "
        "generated it without sending anything. Open it in a browser, then hit "
        "\"I've verified — continue\" in the app."
    )


def verify(email: str) -> None:
    u = _user(email)
    if u.email_verified:
        print(f"{email} is already verified. Nothing to do.")
        return
    auth.update_user(u.uid, email_verified=True)
    print(f"{email} marked verified. Hit \"I've verified — continue\" in the app.")


def delete(email: str) -> None:
    u = _user(email)
    auth.delete_user(u.uid)
    print(f"Deleted {email} ({u.uid}). That address can sign up again now.")
    print(
        "⚠️ This removes the Firebase login only. Any EcoEats profile row keyed "
        "to that uid stays behind, and a fresh signup gets a NEW uid — so the "
        "app will treat it as a brand-new user and ask for a role again."
    )


def _web_api_key() -> str:
    """The client-side Firebase key, read from mobile/.env.

    Deliberately the web key and not the service account: the point of `send` is
    to walk the same path a real signup walks, and a real signup holds no admin
    credentials.
    """
    if not ENV_FILE.exists():
        sys.exit(f"No {ENV_FILE}. Copy mobile/.env.example and fill it in.")
    for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
        name, _, value = raw.partition("=")
        if name.strip() == "EXPO_PUBLIC_FIREBASE_API_KEY":
            return value.strip().strip('"').strip("'")
    sys.exit(f"No EXPO_PUBLIC_FIREBASE_API_KEY in {ENV_FILE}.")


def _post(endpoint: str, key: str, payload: dict) -> dict:
    response = requests.post(
        f"{IDENTITY}:{endpoint}?key={key}", json=payload, timeout=30
    )
    body = response.json()
    if response.ok:
        return body
    error = body.get("error", {}).get("message", response.text)
    if error == "EMAIL_EXISTS":
        sys.exit(
            """That address already has a Firebase account, so signup cannot be
replayed. Delete it first, then send again — between two delivery tests always
delete, otherwise you are measuring a resend and not a signup."""
        )
    sys.exit(f"{endpoint} failed: {error}")


def send(email: str) -> None:
    key = _web_api_key()
    started = time.monotonic()

    created = _post(
        "signUp",
        key,
        {
            "email": email,
            # Throwaway: this account lives only long enough to send one email.
            "password": secrets.token_urlsafe(16),
            "returnSecureToken": True,
        },
    )
    _post(
        "sendOobCode",
        key,
        {"requestType": "VERIFY_EMAIL", "idToken": created["idToken"]},
    )

    elapsed = time.monotonic() - started
    print(f"Firebase accepted the send for {email} in {elapsed:.1f}s.")
    print(f"uid: {created['localId']}")
    print(
        """
⚠️ ACCEPTED IS NOT DELIVERED. Firebase reports success the moment it queues the
mail, and a gateway can quarantine it afterwards with no bounce — that silence
is the whole of §2H. To learn anything, check BOTH:

  1. the inbox, spam folder included
  2. the SMTP provider's own delivery log, which is the half Firebase's built-in
     sender never gave us, and the reason for routing through one at all

Then free the address again:"""
    )
    print(f"  python scripts/dev_account.py delete {email}")


COMMANDS = {
    "show": show,
    "link": link,
    "verify": verify,
    "send": send,
    "delete": delete,
}


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    _connect()
    COMMANDS[sys.argv[1]](sys.argv[2].strip())


if __name__ == "__main__":
    main()
