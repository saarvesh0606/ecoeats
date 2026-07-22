"""The schema's guarantees, asserted against a real PostgreSQL database.

These are not tests of application logic. They prove that certain broken states
are *unrepresentable* — that no future code path, however wrong, can persist
them. Several correspond directly to bugs the previous implementation shipped.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Claim, ListingPhoto
from api.models.enums import ClaimStatus, ListingStatus, UserRole
from tests.factories import make_claim, make_listing, make_photo, make_user


# --------------------------------------------------------------------------
# Inventory
# --------------------------------------------------------------------------


async def test_remaining_quantity_cannot_exceed_the_total(db: AsyncSession) -> None:
    """The v1 bug that inflated inventory, now rejected by PostgreSQL.

    Marking the same claim as a no-show twice refunded the portions twice,
    leaving a listing advertising more food than ever existed. No application
    code can do that here.
    """
    organizer = make_user(role=UserRole.ORGANIZER)
    db.add(organizer)
    await db.flush()

    listing = make_listing(organizer=organizer, quantity_total=15)
    db.add(listing)
    await db.flush()

    listing.quantity_remaining = 16

    with pytest.raises(IntegrityError, match="ck_listings_remaining_within_total"):
        await db.flush()


async def test_remaining_quantity_cannot_go_negative(db: AsyncSession) -> None:
    organizer = make_user(role=UserRole.ORGANIZER)
    db.add(organizer)
    await db.flush()

    listing = make_listing(organizer=organizer, quantity_total=5)
    db.add(listing)
    await db.flush()

    listing.quantity_remaining = -1

    with pytest.raises(IntegrityError, match="ck_listings_remaining_non_negative"):
        await db.flush()


async def test_expiry_window_must_be_one_the_spec_offers(db: AsyncSession) -> None:
    """15, 20, 30, 45 or 60 minutes. v1 accepted any positive integer."""
    organizer = make_user(role=UserRole.ORGANIZER)
    db.add(organizer)
    await db.flush()

    db.add(make_listing(organizer=organizer, expiry_minutes=37))

    with pytest.raises(IntegrityError, match="ck_listings_expiry_choice"):
        await db.flush()


# --------------------------------------------------------------------------
# Claims
# --------------------------------------------------------------------------


async def test_one_recipient_cannot_claim_the_same_listing_twice(
    db: AsyncSession,
) -> None:
    """Enforced by the database, not by a read-then-write check in the API.

    A SELECT-then-INSERT has a race: two concurrent requests can both observe
    "no existing claim" before either writes.
    """
    organizer = make_user(role=UserRole.ORGANIZER)
    recipient = make_user(role=UserRole.RECIPIENT)
    db.add_all([organizer, recipient])
    await db.flush()

    listing = make_listing(organizer=organizer)
    db.add(listing)
    await db.flush()

    db.add(make_claim(listing=listing, recipient=recipient))
    await db.flush()

    db.add(make_claim(listing=listing, recipient=recipient))

    with pytest.raises(IntegrityError, match="uq_claim_per_recipient"):
        await db.flush()


async def test_different_recipients_may_claim_the_same_listing(
    db: AsyncSession,
) -> None:
    """Positive control — the constraint above must not be over-broad."""
    organizer = make_user(role=UserRole.ORGANIZER)
    first = make_user(role=UserRole.RECIPIENT)
    second = make_user(role=UserRole.RECIPIENT)
    db.add_all([organizer, first, second])
    await db.flush()

    listing = make_listing(organizer=organizer)
    db.add(listing)
    await db.flush()

    db.add_all(
        [
            make_claim(listing=listing, recipient=first),
            make_claim(listing=listing, recipient=second),
        ]
    )
    await db.flush()

    claims = await db.scalars(select(Claim).where(Claim.listing_id == listing.id))
    assert len(claims.all()) == 2


async def test_a_pending_claim_cannot_be_marked_resolved(db: AsyncSession) -> None:
    """`resolved_at` and `status` move together or not at all.

    This is what keeps the release logic honest: a claim still holding
    inventory can never look finished.
    """
    organizer = make_user(role=UserRole.ORGANIZER)
    recipient = make_user(role=UserRole.RECIPIENT)
    db.add_all([organizer, recipient])
    await db.flush()

    listing = make_listing(organizer=organizer)
    db.add(listing)
    await db.flush()

    claim = make_claim(listing=listing, recipient=recipient)
    db.add(claim)
    await db.flush()

    claim.status = ClaimStatus.PICKED_UP  # resolved_at deliberately left unset

    with pytest.raises(IntegrityError, match="ck_claims_resolved_at_matches_status"):
        await db.flush()


# --------------------------------------------------------------------------
# Accounts
# --------------------------------------------------------------------------


async def test_non_asu_addresses_are_rejected(db: AsyncSession) -> None:
    """Defence in depth behind the token check — the spec allows @asu.edu only."""
    db.add(make_user(email="someone@gmail.com"))

    with pytest.raises(IntegrityError, match="ck_users_asu_email"):
        await db.flush()


async def test_addresses_are_stored_lowercase(db: AsyncSession) -> None:
    """Otherwise Sun@asu.edu and sun@asu.edu are two accounts for one person."""
    db.add(make_user(email="Sun@asu.edu"))

    with pytest.raises(IntegrityError, match="ck_users_email_lowercase"):
        await db.flush()


# --------------------------------------------------------------------------
# Photos and cascades
# --------------------------------------------------------------------------


async def test_two_photos_cannot_share_a_position(db: AsyncSession) -> None:
    organizer = make_user(role=UserRole.ORGANIZER)
    db.add(organizer)
    await db.flush()

    listing = make_listing(organizer=organizer)
    db.add(listing)
    await db.flush()

    db.add(make_photo(listing=listing, position=0))
    await db.flush()

    db.add(make_photo(listing=listing, position=0))

    with pytest.raises(IntegrityError, match="uq_listing_photo_position"):
        await db.flush()


async def test_deleting_a_listing_removes_its_photos_and_claims(
    db: AsyncSession,
) -> None:
    organizer = make_user(role=UserRole.ORGANIZER)
    recipient = make_user(role=UserRole.RECIPIENT)
    db.add_all([organizer, recipient])
    await db.flush()

    listing = make_listing(organizer=organizer)
    db.add(listing)
    await db.flush()

    db.add_all(
        [
            make_photo(listing=listing, position=0),
            make_photo(listing=listing, position=1),
            make_claim(listing=listing, recipient=recipient),
        ]
    )
    await db.flush()
    listing_id = listing.id

    await db.delete(listing)
    await db.flush()

    photos = await db.scalars(
        select(ListingPhoto).where(ListingPhoto.listing_id == listing_id)
    )
    claims = await db.scalars(select(Claim).where(Claim.listing_id == listing_id))
    assert photos.all() == []
    assert claims.all() == []


async def test_a_valid_listing_persists_with_every_spec_field(
    db: AsyncSession,
) -> None:
    """Positive control for the whole schema, including the fields the feature
    spec added that v1 never had: allergens, campus, placement note, photos."""
    organizer = make_user(role=UserRole.ORGANIZER, name="Wrigley Hall Front Desk")
    db.add(organizer)
    await db.flush()

    listing = make_listing(organizer=organizer, quantity_total=15)
    db.add(listing)
    await db.flush()

    db.add_all([make_photo(listing=listing, position=i) for i in range(3)])
    await db.flush()
    await db.refresh(listing)

    assert listing.status is ListingStatus.ACTIVE
    assert listing.quantity_remaining == 15
    assert listing.allergens is not None
    assert listing.campus == "Tempe"
    assert listing.placement_note == "On the table by the window"
    assert listing.description_source == "manual"
    assert len(await listing.awaitable_attrs.photos) == 3
