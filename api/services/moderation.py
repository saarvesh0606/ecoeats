"""Blocking and reporting.

Kept in one module because they are the same obligation wearing two hats: a
person who does not want to deal with somebody blocks them, and a person who
thinks everyone else should stop dealing with somebody reports them.
"""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.errors import ConflictError, NotFoundError, ValidationError
from api.models import Block, Listing, Report, User
from api.models.enums import ReportReason


async def blocked_user_ids(db: AsyncSession, user_id: str) -> set[str]:
    """Everyone this user cannot see, in either direction.

    A block hides them from you and you from them, so the feed has to check
    both columns. One query returning both sides is cheaper than two, and
    keeps the caller from having to remember the symmetry.
    """
    rows = await db.execute(
        select(Block.blocker_id, Block.blocked_id).where(
            or_(Block.blocker_id == user_id, Block.blocked_id == user_id)
        )
    )
    others: set[str] = set()
    for blocker, blocked in rows.all():
        others.add(blocked if blocker == user_id else blocker)
    return others


async def is_blocked_pair(db: AsyncSession, a: str, b: str) -> bool:
    """Whether either of these two has blocked the other.

    A single pair check for the paths that act on one known counterparty —
    claiming, mostly — where loading the caller's whole block set to answer
    one question would be wasteful.
    """
    if a == b:
        return False
    found = await db.scalar(
        select(Block.id)
        .where(
            or_(
                (Block.blocker_id == a) & (Block.blocked_id == b),
                (Block.blocker_id == b) & (Block.blocked_id == a),
            )
        )
        .limit(1)
    )
    return found is not None


async def block_user(db: AsyncSession, *, blocker_id: str, blocked_id: str) -> Block:
    """Stop seeing someone, and stop them seeing you.

    Blocking again is a no-op that returns the existing row rather than an
    error: the caller's intent is already satisfied, and a 409 here would make
    a double-tap look like a failure.
    """
    if blocker_id == blocked_id:
        raise ValidationError("You cannot block yourself")

    target = await db.get(User, blocked_id)
    if target is None:
        raise NotFoundError("No such user")

    existing = await db.scalar(
        select(Block).where(
            Block.blocker_id == blocker_id, Block.blocked_id == blocked_id
        )
    )
    if existing is not None:
        return existing

    block = Block(blocker_id=blocker_id, blocked_id=blocked_id)
    db.add(block)
    try:
        await db.flush()
    except IntegrityError as exc:
        # Two taps racing. The other one won and the intent is satisfied.
        await db.rollback()
        found = await db.scalar(
            select(Block).where(
                Block.blocker_id == blocker_id, Block.blocked_id == blocked_id
            )
        )
        if found is None:
            raise ConflictError("Could not block that account") from exc
        return found
    return block


async def unblock_user(db: AsyncSession, *, blocker_id: str, blocked_id: str) -> None:
    """Undo a block. Unblocking someone who was never blocked is a no-op."""
    block = await db.scalar(
        select(Block).where(
            Block.blocker_id == blocker_id, Block.blocked_id == blocked_id
        )
    )
    if block is not None:
        await db.delete(block)
        await db.flush()


async def list_blocks(db: AsyncSession, user_id: str) -> list[tuple[User, Block]]:
    """Who this user has blocked, newest first, with enough to render a row.

    Only blocks *they* made — being blocked by somebody is not theirs to see,
    and showing it would turn a quiet exit into a notification.
    """
    rows = await db.execute(
        select(User, Block)
        .join(Block, Block.blocked_id == User.id)
        .where(Block.blocker_id == user_id)
        .order_by(Block.created_at.desc())
    )
    return list(rows.all())  # type: ignore[arg-type]


async def report_listing(
    db: AsyncSession,
    *,
    listing_id: uuid.UUID,
    reporter_id: str,
    reason: ReportReason,
    detail: str | None,
) -> Report:
    """File a report against a listing.

    The listing's title and its organizer are copied onto the report, because
    a listing lives at most an hour and the report has to still make sense
    afterwards. Reporting the same thing twice is allowed: a second report is
    a signal, not a mistake.
    """
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("That listing no longer exists")

    report = Report(
        reporter_id=reporter_id,
        listing_id=listing.id,
        reported_user_id=listing.organizer_id,
        reason=reason.value,
        detail=(detail or "").strip() or None,
        listing_title=listing.title,
    )
    db.add(report)
    await db.flush()
    return report
