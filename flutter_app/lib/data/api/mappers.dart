import 'package:ecoeats/domain/entities/claim.dart';
import 'package:ecoeats/domain/entities/food_post.dart';

/// Translation between the API's vocabulary and this client's.
///
/// The two were designed apart and do not use the same words for the same
/// things, so every mismatch is resolved here rather than in the repositories —
/// there is exactly one place to look when a status stops lining up.

// ─── Listing status ───────────────────────────────────────────────────────────
// API:    draft | scheduled | active | claimed | expired | cancelled
// Client: draft | scheduled | live   | outOfStock | ended
//
// "claimed" means every portion is spoken for, which is what outOfStock means
// here. Both expired and cancelled collapse to ended: the client only ever
// asks whether a post is still running, and it isn't in either case.
PostStatus postStatusFromApi(String? value) {
  switch (value) {
    case 'draft':
      return PostStatus.draft;
    case 'scheduled':
      return PostStatus.scheduled;
    case 'active':
      return PostStatus.live;
    case 'claimed':
      return PostStatus.outOfStock;
    case 'expired':
    case 'cancelled':
      return PostStatus.ended;
    default:
      return PostStatus.live;
  }
}

/// Only the two values `PATCH /listings/{id}` will accept. Ending a post is a
/// different endpoint (`/cancel`), not a status write.
String? postStatusToApi(PostStatus status) {
  switch (status) {
    case PostStatus.live:
      return 'active';
    case PostStatus.outOfStock:
      return 'claimed';
    default:
      return null;
  }
}

// ─── Claim status ─────────────────────────────────────────────────────────────
// API:    pending | picked_up | no_show | cancelled
// Client: reserved | confirmed | pickedUp | expired | cancelled
//
// A reservation the recipient never collected comes back as no_show; from the
// recipient's side that reads as expired, which is also the tab it belongs in.
ClaimStatus claimStatusFromApi(String? value) {
  switch (value) {
    case 'pending':
      return ClaimStatus.reserved;
    case 'picked_up':
      return ClaimStatus.pickedUp;
    case 'no_show':
      return ClaimStatus.expired;
    case 'cancelled':
      return ClaimStatus.cancelled;
    default:
      return ClaimStatus.reserved;
  }
}

String? claimStatusToApi(ClaimStatus status) {
  switch (status) {
    case ClaimStatus.reserved:
    case ClaimStatus.confirmed:
      return 'pending';
    case ClaimStatus.pickedUp:
      return 'picked_up';
    case ClaimStatus.expired:
      return 'no_show';
    case ClaimStatus.cancelled:
      return 'cancelled';
  }
}

// ─── Dietary tags ─────────────────────────────────────────────────────────────
// The API takes free strings; these are the spellings the other client already
// writes, so both produce the same rows.
const Map<DietaryTag, String> _dietaryToApi = {
  DietaryTag.vegetarian: 'vegetarian',
  DietaryTag.vegan: 'vegan',
  DietaryTag.glutenFree: 'gluten-free',
  DietaryTag.halal: 'halal',
  DietaryTag.kosher: 'kosher',
  DietaryTag.containsDairy: 'contains-dairy',
  DietaryTag.containsNuts: 'contains-nuts',
};

String dietaryToApi(DietaryTag tag) => _dietaryToApi[tag] ?? 'vegetarian';

/// Unknown tags are dropped rather than guessed at. The field is free text
/// server-side, so a new tag must not crash a feed that is otherwise fine.
List<DietaryTag> dietaryFromApi(List<dynamic>? values) {
  if (values == null) return const [];
  final reverse = {for (final e in _dietaryToApi.entries) e.value: e.key};
  return values
      .map((v) => reverse['$v'.toLowerCase()])
      .whereType<DietaryTag>()
      .toList();
}

// ─── Expiry ───────────────────────────────────────────────────────────────────

/// The only windows the API accepts, in minutes.
const List<int> kExpiryChoices = [15, 20, 30, 45, 60];

/// Turns a target time into one of the allowed windows.
///
/// ⚠️ The two sides disagree here and the API is the one that is right. This
/// client's create flow offers "Today / Tomorrow / Within 2 Days", but a
/// listing can live at most **60 minutes** — that limit is deliberate, since
/// the whole point is food being collected before it spoils. Anything longer
/// is therefore clamped to an hour, which means a host choosing "Tomorrow"
/// does not get tomorrow. The picker needs replacing with these five choices;
/// clamping keeps the call legal until it is.
int expiryMinutesFrom(DateTime? expiresAt) {
  if (expiresAt == null) return 60;
  final minutes = expiresAt.difference(DateTime.now()).inMinutes;
  if (minutes <= kExpiryChoices.first) return kExpiryChoices.first;
  if (minutes >= kExpiryChoices.last) return kExpiryChoices.last;
  return kExpiryChoices.reduce(
    (a, b) => (a - minutes).abs() <= (b - minutes).abs() ? a : b,
  );
}

// ─── Entities ─────────────────────────────────────────────────────────────────

DateTime _date(dynamic value) =>
    DateTime.tryParse('$value')?.toLocal() ?? DateTime.now();

FoodPostEntity foodPostFromApi(Map<String, dynamic> json) {
  final organizer = (json['organizer'] as Map?)?.cast<String, dynamic>() ?? {};
  final room = json['room'] as String?;
  final building = json['building'] as String? ?? '';

  return FoodPostEntity(
    id: '${json['id']}',
    hostId: '${organizer['id'] ?? ''}',
    hostName: '${organizer['name'] ?? 'Host'}',
    // The API has no host avatars; initials stand in, which the UI already
    // falls back to.
    hostAvatarUrl: null,
    hostRating: (organizer['rating'] as num?)?.toDouble() ?? 5.0,
    title: '${json['title'] ?? ''}',
    description: '${json['description'] ?? ''}',
    allergens: json['allergens'] as String?,
    imageUrls: ((json['photo_urls'] as List?) ?? const [])
        .map((e) => '$e')
        .toList(),
    totalQuantity: (json['quantity_total'] as num?)?.toInt() ?? 0,
    remainingQuantity: (json['quantity_remaining'] as num?)?.toInt() ?? 0,
    dietaryTags: dietaryFromApi(json['dietary_tags'] as List?),
    // The API splits a location into campus / building / room; this client
    // shows a name and an address, so the building (with its room) becomes the
    // name and the campus becomes the address.
    locationName: room == null || room.isEmpty ? building : '$building, $room',
    locationAddress: '${json['campus'] ?? ''}',
    locationNotes: json['placement_note'] as String?,
    lat: (json['lat'] as num?)?.toDouble() ?? 33.4242,
    lng: (json['lng'] as num?)?.toDouble() ?? -111.9281,
    distanceMiles: (json['distance_miles'] as num?)?.toDouble() ?? 0.0,
    expiresAt: _date(json['expires_at']),
    createdAt: _date(json['created_at']),
    status: postStatusFromApi(json['status'] as String?),
    // Not a concept server-side. The feed is already ordered most-urgent
    // first, so the top card is the one worth featuring.
    isFeatured: false,
  );
}

/// Body for `POST /listings`.
Map<String, dynamic> createListingBody(
  FoodPostEntity post, {
  required double lat,
  required double lng,
  String campus = 'Tempe',
}) {
  return {
    'title': post.title,
    'description': post.description,
    'description_source': 'manual',
    if (post.allergens != null) 'allergens': post.allergens,
    'dietary_tags': post.dietaryTags.map(dietaryToApi).toList(),
    'quantity_total': post.totalQuantity,
    'expiry_minutes': expiryMinutesFrom(post.expiresAt),
    'location': {
      'campus': post.locationAddress.isEmpty ? campus : post.locationAddress,
      'building': post.locationName.isEmpty ? 'Campus' : post.locationName,
      'placement_note': post.locationNotes,
      'lat': lat,
      'lng': lng,
    },
    'photo_urls': post.imageUrls,
    'publish': 'now',
  };
}

ClaimEntity claimFromApi(Map<String, dynamic> json) {
  final listing = (json['listing'] as Map?)?.cast<String, dynamic>();
  final photos = (listing?['photo_urls'] as List?) ?? const [];
  final room = listing?['room'] as String?;
  final building = '${listing?['building'] ?? ''}';

  return ClaimEntity(
    id: '${json['id']}',
    postId: '${json['listing_id']}',
    userId: '${json['recipient_id']}',
    // ⚠️ There is no `listing_title` on this payload — the title is nested on
    // `listing`, which is itself nullable.
    postTitle: '${listing?['title'] ?? 'Food'}',
    postImageUrl: photos.isEmpty ? null : '${photos.first}',
    locationName: room == null || room.isEmpty ? building : '$building, $room',
    locationAddress: '${listing?['campus'] ?? ''}',
    status: claimStatusFromApi(json['status'] as String?),
    claimedAt: _date(json['claimed_at']),
    pickupWindowStart: _date(json['claimed_at']),
    // The hold, not a scheduled window — this is what the countdown on My
    // Claims runs against.
    pickupWindowEnd: _date(json['reservation_expires_at']),
    servingsClaimed: (json['quantity'] as num?)?.toInt() ?? 1,
  );
}
