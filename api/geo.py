"""Distance helpers for the map and the radius filter.

Plain trigonometry rather than PostGIS. A campus fits in a few square miles,
where the flat-earth error is negligible and the operational cost of a spatial
extension is not.
"""

from math import asin, cos, degrees, radians, sin, sqrt

EARTH_RADIUS_MILES = 3958.7613

#: Degrees of latitude are very nearly constant in length.
MILES_PER_DEGREE_LAT = 69.172


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two points, in miles."""
    lat1_r, lng1_r, lat2_r, lng2_r = map(radians, (lat1, lng1, lat2, lng2))
    dlat = lat2_r - lat1_r
    dlng = lng2_r - lng1_r
    a = sin(dlat / 2) ** 2 + cos(lat1_r) * cos(lat2_r) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * asin(sqrt(a))


def bounding_box(
    lat: float, lng: float, radius_miles: float
) -> tuple[float, float, float, float]:
    """A lat/lng box that fully contains the radius.

    Returned as ``(min_lat, max_lat, min_lng, max_lng)``.

    The box is deliberately a superset of the circle: it is cheap, it uses the
    ``ix_listings_location`` index, and it never excludes a listing that the
    exact distance check would have kept. Corners get trimmed afterwards by
    :func:`haversine_miles`.
    """
    lat_delta = radius_miles / MILES_PER_DEGREE_LAT

    # Lines of longitude converge toward the poles, so a mile spans more
    # degrees the further from the equator you are.
    shrink = cos(radians(lat))
    if abs(shrink) < 1e-9:  # at a pole, every longitude is within range
        lng_delta = 180.0
    else:
        lng_delta = radius_miles / (MILES_PER_DEGREE_LAT * abs(shrink))

    return (
        max(lat - lat_delta, -90.0),
        min(lat + lat_delta, 90.0),
        max(lng - lng_delta, -180.0),
        min(lng + lng_delta, 180.0),
    )


def maps_url(lat: float, lng: float, label: str | None = None) -> str:
    """A universal maps link the phone opens in its default navigation app.

    Apple Maps handles this on iOS and Google Maps on Android, so the client
    does not need to branch on platform.
    """
    query = f"{lat},{lng}"
    if label:
        from urllib.parse import quote

        return f"https://maps.google.com/?q={quote(label)}@{query}"
    return f"https://maps.google.com/?q={query}"


__all__ = [
    "EARTH_RADIUS_MILES",
    "bounding_box",
    "degrees",
    "haversine_miles",
    "maps_url",
]
