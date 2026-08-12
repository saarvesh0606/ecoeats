"""Dev utility for Firebase accounts — testing without inbox access.

⚠️ DEVELOPMENT ONLY. Talks straight to Firebase with the project's service
account, so it bypasses the verification email entirely. That is the whole
point: the app is @asu.edu-only, and an ASU inbox is not always available to
whoever is testing.

Why this exists: Firebase's built-in email sender gives you no delivery
visibility at all. `sendEmailVerification` reporting success only means Firebase
accepted the job — a mail gateway can quarantine it silently afterwards, with no
bounce. So "did the mail arrive?" and "does the app work?" are two separate
questions, and this answers the second one without waiting on the first.

Usage (from the repo root):

    python scripts/dev_account.py show    someone@asu.edu
    python scripts/dev_account.py link    someone@asu.edu
    python scripts/dev_account.py verify  someone@asu.edu
    python scripts/dev_account.py delete  someone@asu.edu

  show    what Firebase knows: uid, whether the email is verified, created when
  link    mint the real verification link WITHOUT sending any email — open it in
          a browser to verify the account by hand
  verify  mark the email verified directly, skipping the link too
  delete  remove the account so the address can be signed up with again
          (Firebase refuses a repeat signup with "email already in use")

⚠️ The API demands BOTH a verified email AND an @asu.edu address. A Gmail
account can be created and verified here, but the backend will still refuse it —
useful for testing Firebase delivery, not for testing the app.
"""

from __future__ import annotations

import sys
from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials

_ROOT = Path(__file__).resolve().parent.parent
CREDENTIALS = _ROOT / "secrets" / "firebase-service-account.json"


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


COMMANDS = {"show": show, "link": link, "verify": verify, "delete": delete}


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    _connect()
    COMMANDS[sys.argv[1]](sys.argv[2].strip())


if __name__ == "__main__":
    main()
