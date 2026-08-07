"""Schemas for registering a device to receive push notifications."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field


class RegisterDevice(BaseModel):
    """An Expo push token the app has just obtained for this device."""

    token: Annotated[str, Field(min_length=8, max_length=255)]
    platform: Literal["ios", "android", "web"] | None = None


class DeviceOut(BaseModel):
    token: str
    platform: str | None = None


__all__ = ["DeviceOut", "RegisterDevice"]
