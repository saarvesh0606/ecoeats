"""Signed upload parameters for Cloudinary.

The phone uploads listing photos straight to Cloudinary — the image bytes never
touch this server. What the server does is *authorise* each upload: it signs a
short set of parameters with the account secret, so only a signed-in organizer
can put an image into our account. Without a signature, Cloudinary refuses the
upload.

The signing algorithm is Cloudinary's, reproduced exactly:
  1. take the parameters to sign, sorted by key
  2. join them as ``key=value&key=value``
  3. append the API secret
  4. SHA-1, hex-encoded
"""

import hashlib
import time
from dataclasses import dataclass

#: Where listing photos land in the Cloudinary media library.
UPLOAD_FOLDER = "ecoeats/listings"


def sign_params(params: dict[str, str | int], *, api_secret: str) -> str:
    """Return the SHA-1 signature Cloudinary expects for these parameters."""
    payload = "&".join(f"{key}={params[key]}" for key in sorted(params))
    return hashlib.sha1(f"{payload}{api_secret}".encode()).hexdigest()


@dataclass(frozen=True, slots=True)
class UploadTicket:
    """Everything the client needs to perform one signed upload.

    Exactly the fields that must accompany the request, plus the endpoint to
    send it to. The client adds only the image ``file`` itself.
    """

    cloud_name: str
    api_key: str
    timestamp: int
    folder: str
    signature: str

    @property
    def upload_url(self) -> str:
        return f"https://api.cloudinary.com/v1_1/{self.cloud_name}/image/upload"


def build_upload_ticket(
    *,
    cloud_name: str,
    api_key: str,
    api_secret: str,
    now: int | None = None,
) -> UploadTicket:
    """Mint a signed, short-lived ticket for a single photo upload.

    The signature covers ``timestamp`` and ``folder``. Every non-file parameter
    the client sends to Cloudinary must be in the signature, so the client must
    send exactly these and nothing more — an extra unsigned parameter makes
    Cloudinary reject the upload, which is the point: the client cannot widen
    what it was authorised to do.

    Cloudinary treats the timestamp as valid for roughly an hour, so a ticket
    is not a lasting grant.
    """
    timestamp = now if now is not None else int(time.time())
    signed = {"timestamp": timestamp, "folder": UPLOAD_FOLDER}
    signature = sign_params(signed, api_secret=api_secret)

    return UploadTicket(
        cloud_name=cloud_name,
        api_key=api_key,
        timestamp=timestamp,
        folder=UPLOAD_FOLDER,
        signature=signature,
    )
