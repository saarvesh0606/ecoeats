/// How long a post may stay up, in minutes — the only windows that exist.
///
/// This is a product rule, not an API detail, which is why it lives here: food
/// is posted to be collected before it spoils, so an hour is the longest a
/// listing can live. Day-level expiry was considered and deliberately rejected.
///
/// The picker and the request builder both read this list, so the screen cannot
/// offer a window the server would refuse. It previously offered "Today /
/// Tomorrow / Within 2 Days" — none of which the API accepts — and a host
/// choosing Tomorrow silently got an hour.
const List<int> kExpiryWindowMinutes = [15, 20, 30, 45, 60];

/// The label for a window, e.g. `15m`, `1h`.
String expiryWindowLabel(int minutes) =>
    minutes >= 60 ? '${minutes ~/ 60}h' : '${minutes}m';

enum PostStatus { draft, live, scheduled, outOfStock, ended }

enum DietaryTag { vegetarian, vegan, glutenFree, containsDairy, containsNuts, halal, kosher }

class FoodPostEntity {
  final String id;
  final String hostId;
  final String hostName;
  final String? hostAvatarUrl;
  final double hostRating;
  final String title;
  final String description;

  /// Free-text allergen warning, straight from the host.
  /// The API carries this and the entity had nowhere to put it, so the
  /// warning was being dropped on the way in — on a food app that is the
  /// one field you cannot afford to lose.
  final String? allergens;

  final List<String> imageUrls;
  final int totalQuantity;
  final int remainingQuantity;
  final List<DietaryTag> dietaryTags;
  final String locationName;
  final String locationAddress;
  final String? locationNotes;

  /// Where the food actually is. The API requires a coordinate on every
  /// listing and computes distance from it; this client had none, so posts had
  /// nowhere to be. Defaults to the Tempe campus centre, the same fallback the
  /// other client uses when a host has not dropped a pin.
  final double lat;
  final double lng;

  final double distanceMiles;
  final DateTime expiresAt;
  final DateTime createdAt;
  final PostStatus status;
  final bool isFeatured;

  const FoodPostEntity({
    required this.id,
    required this.hostId,
    required this.hostName,
    this.hostAvatarUrl,
    this.hostRating = 5.0,
    required this.title,
    required this.description,
    this.allergens,
    this.imageUrls = const [],
    required this.totalQuantity,
    required this.remainingQuantity,
    this.dietaryTags = const [],
    required this.locationName,
    required this.locationAddress,
    this.locationNotes,
    this.lat = 33.4242,
    this.lng = -111.9281,
    this.distanceMiles = 0.0,
    required this.expiresAt,
    required this.createdAt,
    this.status = PostStatus.live,
    this.isFeatured = false,
  });

  bool get isLive => status == PostStatus.live;
  bool get hasStock => remainingQuantity > 0;

  int get minutesLeft {
    final diff = expiresAt.difference(DateTime.now());
    return diff.isNegative ? 0 : diff.inMinutes;
  }

  String get dietaryTagsDisplay =>
      dietaryTags.map((t) => t.displayName).join(' · ');

  FoodPostEntity copyWith({
    String? id,
    String? hostId,
    String? hostName,
    String? hostAvatarUrl,
    double? hostRating,
    String? title,
    String? description,
    String? allergens,
    List<String>? imageUrls,
    int? totalQuantity,
    int? remainingQuantity,
    List<DietaryTag>? dietaryTags,
    String? locationName,
    String? locationAddress,
    String? locationNotes,
    double? lat,
    double? lng,
    double? distanceMiles,
    DateTime? expiresAt,
    DateTime? createdAt,
    PostStatus? status,
    bool? isFeatured,
  }) {
    return FoodPostEntity(
      id: id ?? this.id,
      hostId: hostId ?? this.hostId,
      hostName: hostName ?? this.hostName,
      hostAvatarUrl: hostAvatarUrl ?? this.hostAvatarUrl,
      hostRating: hostRating ?? this.hostRating,
      title: title ?? this.title,
      description: description ?? this.description,
      allergens: allergens ?? this.allergens,
      imageUrls: imageUrls ?? this.imageUrls,
      totalQuantity: totalQuantity ?? this.totalQuantity,
      remainingQuantity: remainingQuantity ?? this.remainingQuantity,
      dietaryTags: dietaryTags ?? this.dietaryTags,
      locationName: locationName ?? this.locationName,
      locationAddress: locationAddress ?? this.locationAddress,
      locationNotes: locationNotes ?? this.locationNotes,
      lat: lat ?? this.lat,
      lng: lng ?? this.lng,
      distanceMiles: distanceMiles ?? this.distanceMiles,
      expiresAt: expiresAt ?? this.expiresAt,
      createdAt: createdAt ?? this.createdAt,
      status: status ?? this.status,
      isFeatured: isFeatured ?? this.isFeatured,
    );
  }

  // The fields that change over a post's life take part in equality, not just
  // the id. Riverpod skips notifying listeners when new state == old state, so
  // an id-only comparison made a refetched post with one fewer serving equal
  // to the stale one — watchers never rebuilt and the quantity on screen sat
  // still while the data underneath it moved.
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is FoodPostEntity &&
          id == other.id &&
          remainingQuantity == other.remainingQuantity &&
          status == other.status;

  @override
  int get hashCode => Object.hash(id, remainingQuantity, status);
}

extension DietaryTagExtension on DietaryTag {
  String get displayName {
    switch (this) {
      case DietaryTag.vegetarian:
        return 'Vegetarian';
      case DietaryTag.vegan:
        return 'Vegan';
      case DietaryTag.glutenFree:
        return 'Gluten-Free';
      case DietaryTag.containsDairy:
        return 'Contains Dairy';
      case DietaryTag.containsNuts:
        return 'Contains Nuts';
      case DietaryTag.halal:
        return 'Halal';
      case DietaryTag.kosher:
        return 'Kosher';
    }
  }
}
