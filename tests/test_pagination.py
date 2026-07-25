"""Keyset cursor encode/decode."""

import base64
import uuid
from datetime import UTC, datetime

import pytest

from api.pagination import decode_cursor, encode_cursor


def test_cursor_round_trips() -> None:
    when = datetime(2026, 7, 25, 12, 30, 15, tzinfo=UTC)
    who = uuid.uuid4()

    expires_at, listing_id = decode_cursor(encode_cursor(when, who))

    assert expires_at == when
    assert listing_id == who


def test_cursor_preserves_the_timezone() -> None:
    """The comparison is against a tz-aware column; a naive value would raise."""
    when = datetime(2026, 1, 1, tzinfo=UTC)
    expires_at, _ = decode_cursor(encode_cursor(when, uuid.uuid4()))
    assert expires_at.tzinfo is not None


@pytest.mark.parametrize(
    "bad",
    [
        "",  # empty
        "not base64!!!",  # invalid base64
        base64.urlsafe_b64encode(b"no-separator").decode(),  # no "|"
        base64.urlsafe_b64encode(b"not-a-date|" + uuid.uuid4().hex.encode()).decode(),
        base64.urlsafe_b64encode(b"2026-01-01T00:00:00+00:00|not-a-uuid").decode(),
    ],
)
def test_malformed_cursor_raises_value_error(bad: str) -> None:
    with pytest.raises(ValueError):
        decode_cursor(bad)
