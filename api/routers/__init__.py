from api.routers.claims import router as claims_router
from api.routers.devices import router as devices_router
from api.routers.listings import router as listings_router
from api.routers.notifications import router as notifications_router
from api.routers.uploads import router as uploads_router
from api.routers.users import router as users_router

__all__ = [
    "claims_router",
    "devices_router",
    "listings_router",
    "notifications_router",
    "uploads_router",
    "users_router",
]
