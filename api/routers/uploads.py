"""Upload authorisation.

One endpoint: it hands a signed-in organizer a ticket to upload a photo
directly to Cloudinary. The image never passes through this API.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel

from api.config import Settings
from api.deps import CurrentOrganizer
from api.errors import AppError
from api.services.uploads import build_upload_ticket

router = APIRouter(prefix="/uploads", tags=["uploads"])


class UploadTicketOut(BaseModel):
    """The signed parameters the client sends to Cloudinary, plus the endpoint.

    The client POSTs multipart form data to ``upload_url`` with these fields and
    the image file, then gets back a URL to store in the listing's photos.
    """

    upload_url: str
    cloud_name: str
    api_key: str
    timestamp: int
    folder: str
    signature: str


@router.post("/signature", response_model=UploadTicketOut)
async def create_upload_signature(
    request: Request, organizer: CurrentOrganizer
) -> UploadTicketOut:
    """Authorise one photo upload for the current organizer."""
    settings: Settings = request.app.state.settings

    if not settings.cloudinary_configured:
        # A 503 rather than a 500: the fault is deployment configuration, not
        # the request, and it is recoverable without a code change.
        raise _NotConfigured()

    ticket = build_upload_ticket(
        cloud_name=settings.cloudinary_cloud_name,  # type: ignore[arg-type]
        api_key=settings.cloudinary_api_key,  # type: ignore[arg-type]
        api_secret=settings.resolve_cloudinary_secret(),  # type: ignore[arg-type]
    )

    return UploadTicketOut(
        upload_url=ticket.upload_url,
        cloud_name=ticket.cloud_name,
        api_key=ticket.api_key,
        timestamp=ticket.timestamp,
        folder=ticket.folder,
        signature=ticket.signature,
    )


class _NotConfigured(AppError):
    status_code = 503
    message = "Photo uploads are not available right now"
