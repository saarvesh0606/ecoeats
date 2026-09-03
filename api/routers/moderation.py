"""Reporting content and blocking people.

Required of any app carrying user-generated content — App Store Guideline 1.2
asks for a way to report offensive material and a way to block abusive users,
and this is it. Kept in one prefix-less router because the two halves hang off
different resources: a report is about a listing, a block is about a person.
"""

import uuid

from fastapi import APIRouter, Depends, status

from api.deps import CurrentUser, DbSession, rate_limited
from api.schemas.moderation import BlockedUser, BlockList, CreateReport, ReportOut
from api.services import moderation as service

router = APIRouter(tags=["moderation"])


@router.post(
    "/listings/{listing_id}/report",
    response_model=ReportOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limited("report", limit=10, window_seconds=60))],
)
async def report_listing(
    listing_id: uuid.UUID,
    body: CreateReport,
    db: DbSession,
    user: CurrentUser,
) -> ReportOut:
    """Report a listing for a human to look at.

    Deliberately succeeds quietly. The reporter is told it was received and
    nothing else — whether the listing was removed, and what happened to the
    account behind it, is not the reporter's to know, and telling them turns
    the feature into a way of probing other people's accounts.
    """
    report = await service.report_listing(
        db,
        listing_id=listing_id,
        reporter_id=user.id,
        reason=body.reason,
        detail=body.detail,
    )
    return ReportOut.model_validate(report)


@router.post("/users/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def block(user_id: str, db: DbSession, user: CurrentUser) -> None:
    """Block someone.

    Their listings disappear from your feed and yours from theirs, and neither
    of you can claim the other's food. Idempotent: blocking twice is fine.
    """
    await service.block_user(db, blocker_id=user.id, blocked_id=user_id)


@router.delete("/users/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def unblock(user_id: str, db: DbSession, user: CurrentUser) -> None:
    """Unblock someone. A no-op if they were not blocked."""
    await service.unblock_user(db, blocker_id=user.id, blocked_id=user_id)


@router.get("/users/me/blocks", response_model=BlockList)
async def my_blocks(db: DbSession, user: CurrentUser) -> BlockList:
    """Who you have blocked, so a block can be undone.

    Only blocks you made. Being blocked by somebody is not shown — a block is
    meant to be a quiet exit, and surfacing it would make it a confrontation.
    """
    rows = await service.list_blocks(db, user.id)
    return BlockList(
        items=[
            BlockedUser(
                user_id=other.id,
                display_name=other.name,
                blocked_at=block.created_at,
            )
            for other, block in rows
        ],
        count=len(rows),
    )
