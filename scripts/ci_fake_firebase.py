"""Generate a throwaway, structurally valid Firebase service account for CI.

A few tests construct a FirebaseTokenVerifier or check firebase_configured.
Constructing the verifier only loads the certificate locally — it never calls
Google — so a self-generated RSA key satisfies them without the real secret
being present in CI.

Writes to the path given as the first argument, or
secrets/firebase-service-account.json by default. Run this only where the real
credentials are absent (CI); locally it would overwrite the real file.
"""

import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def main() -> None:
    target = Path(
        sys.argv[1] if len(sys.argv) > 1 else "secrets/firebase-service-account.json"
    )

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    service_account = {
        "type": "service_account",
        "project_id": "ecoeats-f09a8",
        "private_key_id": "ci-throwaway",
        "private_key": pem,
        "client_email": "ci@ecoeats-f09a8.iam.gserviceaccount.com",
        "client_id": "0",
        "token_uri": "https://oauth2.googleapis.com/token",
    }

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(service_account), encoding="utf-8")
    print(f"Wrote throwaway service account to {target}")


if __name__ == "__main__":
    main()
