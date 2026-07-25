"""Opaque keyset-pagination cursors for the feed.

The feed is ordered by ``(expires_at, id)``. A cursor encodes the row a page
ended on, so the next page resumes at exactly that point. This is stable while
listings are posted, claimed, or expire between requests — offset pagination is
not: a row leaving the set above your offset silently shifts everything down a
slot, so you skip an item; a row entering shows you one twice.

The encoding is deliberately opaque (base64) so clients treat it as a token to
echo back, not a structure to build themselves.
"""

import base64
import binascii
import uuid
from datetime import datetime


def encode_cursor(expires_at: datetime, listing_id: uuid.UUID) -> str:
    """Encode the ``(expires_at, id)`` a page ended on into an opaque token."""
    raw = f"{expires_at.isoformat()}|{listing_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    """Reverse of :func:`encode_cursor`.

    Raises ``ValueError`` on anything malformed — a truncated token, a bad
    timestamp, a non-UUID id — so the route can answer 400 rather than 500.
    """
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        iso, sep, id_str = raw.rpartition("|")
        if not sep:
            raise ValueError("cursor is missing its separator")
        return datetime.fromisoformat(iso), uuid.UUID(id_str)
    except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
        raise ValueError("malformed pagination cursor") from exc
