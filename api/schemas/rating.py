"""Request shapes for rating a host after a pickup."""

from pydantic import BaseModel, Field


class CreateRating(BaseModel):
    stars: int = Field(ge=1, le=5, description="How the pickup went, 1–5 stars.")
    comment: str | None = Field(
        default=None,
        max_length=1000,
        description="Optional note for the host.",
    )
