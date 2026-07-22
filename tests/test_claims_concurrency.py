"""Claiming under real concurrency, and the background sweeps.

Everything here uses ``live_client``: real connections, real commits, real row
locks. The shared-transaction fixture the other suites use is faster and
isolates better, but it cannot test locking — every request would be the same
connection, and nothing would ever contend.

This is the file that decides whether the product works. A food-rescue app
whose claim flow oversells is worse than no app: people walk across campus for
food that is not there.
"""

import asyncio
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from api.models import Claim, Listing
from api.models.enums import ClaimStatus, ListingStatus
from api.services.claims import expire_stale_listings, sweep_expired_reservations
from api.services.scheduler import sweep_forever
from tests.conftest import Account, register_account
from tests.fake_auth import FakeTokenVerifier
from tests.test_listings import payload


async def _post_listing(
    client: AsyncClient, organizer: Account, **overrides: Any
) -> dict[str, Any]:
    response = await client.post(
        "/listings", headers=organizer.headers, json=payload(**overrides)
    )
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# The race
# ---------------------------------------------------------------------------


async def test_ten_people_race_for_three_portions(
    live_client: AsyncClient, auth: FakeTokenVerifier, engine: AsyncEngine
) -> None:
    """Exactly three win. No overselling, no lost portions.

    This is what `SELECT ... FOR UPDATE` buys: ten concurrent transactions
    serialise on the listing row, so each one reads a quantity that already
    reflects every claim before it.
    """
    organizer = await register_account(
        live_client, auth, "organizer", "Wrigley Hall Front Desk"
    )
    listing = await _post_listing(live_client, organizer, quantity_total=3)

    recipients = [
        await register_account(live_client, auth, "recipient", f"Student {n}")
        for n in range(10)
    ]

    responses = await asyncio.gather(
        *(
            live_client.post(
                "/claims",
                headers=person.headers,
                json={"listing_id": listing["id"]},
            )
            for person in recipients
        )
    )

    statuses = [r.status_code for r in responses]
    assert statuses.count(201) == 3, f"expected 3 winners, got {statuses}"
    assert statuses.count(409) == 7

    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        row = await session.get(Listing, listing["id"])
        assert row is not None
        assert row.quantity_remaining == 0
        assert row.status is ListingStatus.CLAIMED

        claims = await session.scalar(
            select(func.count()).select_from(Claim).where(
                Claim.listing_id == row.id
            )
        )
        assert claims == 3


async def test_one_person_racing_themselves_gets_one_portion(
    live_client: AsyncClient, auth: FakeTokenVerifier, engine: AsyncEngine
) -> None:
    """The unique constraint arbitrating, not a read-then-write check.

    Five simultaneous requests from one account all read "no existing claim"
    before any of them writes. Only PostgreSQL can break that tie.
    """
    organizer = await register_account(live_client, auth, "organizer", "Kitchen")
    listing = await _post_listing(live_client, organizer, quantity_total=10)
    person = await register_account(live_client, auth, "recipient", "Eager Student")

    responses = await asyncio.gather(
        *(
            live_client.post(
                "/claims",
                headers=person.headers,
                json={"listing_id": listing["id"]},
            )
            for _ in range(5)
        )
    )

    statuses = [r.status_code for r in responses]
    assert statuses.count(201) == 1, f"expected exactly 1 claim, got {statuses}"

    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        row = await session.get(Listing, listing["id"])
        assert row is not None
        assert row.quantity_remaining == 9  # exactly one portion gone


async def test_concurrent_releases_do_not_multiply_inventory(
    live_client: AsyncClient, auth: FakeTokenVerifier, engine: AsyncEngine
) -> None:
    """**The v1 inventory-inflation bug, under concurrency.**

    v1 refunded portions on every no-show call. Firing several at once is the
    worst case: without the pending-status guard held under a row lock, each
    would add the portion back and the listing would advertise food that never
    existed.
    """
    organizer = await register_account(live_client, auth, "organizer", "Kitchen")
    listing = await _post_listing(live_client, organizer, quantity_total=5)
    person = await register_account(live_client, auth, "recipient", "Student")

    created = (
        await live_client.post(
            "/claims", headers=person.headers, json={"listing_id": listing["id"]}
        )
    ).json()

    responses = await asyncio.gather(
        *(
            live_client.post(
                f"/claims/{created['id']}/no-show", headers=organizer.headers
            )
            for _ in range(5)
        )
    )

    assert [r.status_code for r in responses].count(200) == 1

    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        row = await session.get(Listing, listing["id"])
        assert row is not None
        assert row.quantity_remaining == 5  # back to five, never six
        assert row.quantity_remaining <= row.quantity_total


async def test_claiming_and_releasing_at_once_stays_consistent(
    live_client: AsyncClient, auth: FakeTokenVerifier, engine: AsyncEngine
) -> None:
    """Mixed traffic: new claims landing while an old one is being released."""
    organizer = await register_account(live_client, auth, "organizer", "Kitchen")
    listing = await _post_listing(live_client, organizer, quantity_total=4)

    first = await register_account(live_client, auth, "recipient", "First")
    created = (
        await live_client.post(
            "/claims", headers=first.headers, json={"listing_id": listing["id"]}
        )
    ).json()

    others = [
        await register_account(live_client, auth, "recipient", f"Other {n}")
        for n in range(6)
    ]

    operations = [
        live_client.post(f"/claims/{created['id']}/no-show", headers=organizer.headers)
    ]
    operations += [
        live_client.post(
            "/claims", headers=person.headers, json={"listing_id": listing["id"]}
        )
        for person in others
    ]

    await asyncio.gather(*operations)

    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        row = await session.get(Listing, listing["id"])
        assert row is not None

        held = await session.scalar(
            select(func.coalesce(func.sum(Claim.quantity), 0)).where(
                Claim.listing_id == row.id,
                Claim.status == ClaimStatus.PENDING,
            )
        )
        # The invariant that matters: portions on the shelf plus portions
        # reserved always equals the total posted.
        assert row.quantity_remaining + held == row.quantity_total
        assert 0 <= row.quantity_remaining <= row.quantity_total


# ---------------------------------------------------------------------------
# Sweeps
# ---------------------------------------------------------------------------


async def test_a_lapsed_reservation_returns_its_portion(
    live_client: AsyncClient, auth: FakeTokenVerifier, engine: AsyncEngine
) -> None:
    """v1 stored `reservation_expires_at` and never read it, so someone who
    never turned up removed a portion from circulation permanently while the
    food sat there going to waste."""
    organizer = await register_account(live_client, auth, "organizer", "Kitchen")
    listing = await _post_listing(live_client, organizer, quantity_total=5)
    person = await register_account(live_client, auth, "recipient", "No Show")

    created = (
        await live_client.post(
            "/claims", headers=person.headers, json={"listing_id": listing["id"]}
        )
    ).json()

    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        async with session.begin():
            claim = await session.get(Claim, created["id"])
            assert claim is not None
            claim.reservation_expires_at = datetime.now(UTC) - timedelta(minutes=1)

    released = await sweep_expired_reservations(factory)
    assert released == 1

    async with factory() as session:
        claim = await session.get(Claim, created["id"])
        assert claim is not None
        assert claim.status is ClaimStatus.NO_SHOW
        assert claim.resolved_at is not None

        row = await session.get(Listing, listing["id"])
        assert row is not None
        assert row.quantity_remaining == 5


async def test_the_sweep_leaves_live_reservations_alone(
    live_client: AsyncClient, auth: FakeTokenVerifier, engine: AsyncEngine
) -> None:
    organizer = await register_account(live_client, auth, "organizer", "Kitchen")
    listing = await _post_listing(live_client, organizer, quantity_total=5)
    person = await register_account(live_client, auth, "recipient", "On Time")

    created = (
        await live_client.post(
            "/claims", headers=person.headers, json={"listing_id": listing["id"]}
        )
    ).json()

    factory = async_sessionmaker(engine, expire_on_commit=False)
    assert await sweep_expired_reservations(factory) == 0

    async with factory() as session:
        claim = await session.get(Claim, created["id"])
        assert claim is not None
        assert claim.status is ClaimStatus.PENDING


async def test_the_sweep_does_not_touch_collected_food(
    live_client: AsyncClient, auth: FakeTokenVerifier, engine: AsyncEngine
) -> None:
    """A picked-up claim whose window has passed must not be refunded — the
    food is already in someone's hands."""
    organizer = await register_account(live_client, auth, "organizer", "Kitchen")
    listing = await _post_listing(live_client, organizer, quantity_total=5)
    person = await register_account(live_client, auth, "recipient", "Collected")

    created = (
        await live_client.post(
            "/claims", headers=person.headers, json={"listing_id": listing["id"]}
        )
    ).json()
    await live_client.post(
        f"/claims/{created['id']}/pickup", headers=organizer.headers
    )

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        async with session.begin():
            claim = await session.get(Claim, created["id"])
            assert claim is not None
            claim.reservation_expires_at = datetime.now(UTC) - timedelta(minutes=1)

    assert await sweep_expired_reservations(factory) == 0

    async with factory() as session:
        row = await session.get(Listing, listing["id"])
        assert row is not None
        assert row.quantity_remaining == 4  # still gone, correctly


async def test_the_background_loop_releases_without_being_asked(
    live_client: AsyncClient, auth: FakeTokenVerifier, engine: AsyncEngine
) -> None:
    """The sweep functions are tested above; this covers the loop that drives
    them, which is what makes the whole thing happen unattended in production."""
    organizer = await register_account(live_client, auth, "organizer", "Kitchen")
    listing = await _post_listing(live_client, organizer, quantity_total=5)
    person = await register_account(live_client, auth, "recipient", "No Show")

    created = (
        await live_client.post(
            "/claims", headers=person.headers, json={"listing_id": listing["id"]}
        )
    ).json()

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        async with session.begin():
            claim = await session.get(Claim, created["id"])
            assert claim is not None
            claim.reservation_expires_at = datetime.now(UTC) - timedelta(minutes=1)

    loop = asyncio.create_task(sweep_forever(factory, interval_seconds=0.05))
    try:
        await asyncio.sleep(0.3)
    finally:
        loop.cancel()
        with suppress(asyncio.CancelledError):
            await loop

    async with factory() as session:
        claim = await session.get(Claim, created["id"])
        assert claim is not None
        assert claim.status is ClaimStatus.NO_SHOW

        row = await session.get(Listing, listing["id"])
        assert row is not None
        assert row.quantity_remaining == 5


async def test_finished_listings_get_marked_expired(
    live_client: AsyncClient, auth: FakeTokenVerifier, engine: AsyncEngine
) -> None:
    """Cosmetic rather than load-bearing — every query already filters on
    expires_at — but organizers should not see finished posts called active."""
    organizer = await register_account(live_client, auth, "organizer", "Kitchen")
    listing = await _post_listing(live_client, organizer)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        async with session.begin():
            row = await session.get(Listing, listing["id"])
            assert row is not None
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)

    assert await expire_stale_listings(factory) == 1

    async with factory() as session:
        row = await session.get(Listing, listing["id"])
        assert row is not None
        assert row.status is ListingStatus.EXPIRED
