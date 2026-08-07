"""Device registration for push notifications."""

from datetime import UTC, datetime

from fastapi import APIRouter, status
from sqlalchemy import delete, select

from api.deps import CurrentUser, DbSession
from api.models import DeviceToken
from api.schemas.device import DeviceOut, RegisterDevice

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("", response_model=DeviceOut, status_code=status.HTTP_200_OK)
async def register_device(
    body: RegisterDevice, db: DbSession, user: CurrentUser
) -> DeviceOut:
    """Claim an Expo push token for the signed-in user.

    Idempotent, and deliberately re-registered on every launch: Expo can rotate
    a token, and `last_seen_at` is the only way to tell a live device from one
    that was uninstalled a year ago.

    Registering a token someone else holds moves it. That is not a conflict to
    reject — it is a reinstall, or a handed-on phone, and the previous owner
    must stop pushing to it.
    """
    existing = await db.scalar(
        select(DeviceToken).where(DeviceToken.token == body.token)
    )

    if existing is None:
        db.add(
            DeviceToken(
                user_id=user.id, token=body.token, platform=body.platform
            )
        )
    else:
        existing.user_id = user.id
        existing.platform = body.platform or existing.platform
        existing.last_seen_at = datetime.now(UTC)

    await db.flush()
    return DeviceOut(token=body.token, platform=body.platform)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_device(
    body: RegisterDevice, db: DbSession, user: CurrentUser
) -> None:
    """Stop pushing to this device — used on sign-out.

    Scoped to the caller's own tokens, so signing out cannot silence somebody
    else's phone.
    """
    await db.execute(
        delete(DeviceToken).where(
            DeviceToken.token == body.token, DeviceToken.user_id == user.id
        )
    )
