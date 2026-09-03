"""Request and response shapes for blocking and reporting."""

import uuid
from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from api.models.enums import ReportReason


class CreateReport(BaseModel):
    """Report a listing.

    The reporter is taken from the verified token, never the body — the same
    rule as everywhere else. The listing is taken from the path.
    """

    reason: ReportReason = Field(
        description="Why it is being reported. Drives triage order."
    )
    detail: str | None = Field(
        default=None,
        max_length=1000,
        description="What is wrong, in the reporter's words.",
    )

    @model_validator(mode="after")
    def _detail_required_for_other(self) -> Self:
        # "Other" with no words is a row nobody can act on.
        if self.reason is ReportReason.OTHER and not (self.detail or "").strip():
            raise ValueError("Tell us what is wrong when choosing 'Other'")
        return self


class ReportOut(BaseModel):
    """Confirmation that a report landed. Deliberately thin: a reporter has no
    business reading back the queue."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reason: ReportReason
    created_at: datetime


class BlockedUser(BaseModel):
    """Someone the caller has blocked, enough to show a row and undo it."""

    model_config = ConfigDict(from_attributes=True)

    user_id: str
    display_name: str | None
    blocked_at: datetime


class BlockList(BaseModel):
    items: list[BlockedUser]
    count: int
