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
  final List<String> imageUrls;
  final int totalQuantity;
  final int remainingQuantity;
  final List<DietaryTag> dietaryTags;
  final String locationName;
  final String locationAddress;
  final String? locationNotes;
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
    this.imageUrls = const [],
    required this.totalQuantity,
    required this.remainingQuantity,
    this.dietaryTags = const [],
    required this.locationName,
    required this.locationAddress,
    this.locationNotes,
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
    List<String>? imageUrls,
    int? totalQuantity,
    int? remainingQuantity,
    List<DietaryTag>? dietaryTags,
    String? locationName,
    String? locationAddress,
    String? locationNotes,
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
      imageUrls: imageUrls ?? this.imageUrls,
      totalQuantity: totalQuantity ?? this.totalQuantity,
      remainingQuantity: remainingQuantity ?? this.remainingQuantity,
      dietaryTags: dietaryTags ?? this.dietaryTags,
      locationName: locationName ?? this.locationName,
      locationAddress: locationAddress ?? this.locationAddress,
      locationNotes: locationNotes ?? this.locationNotes,
      distanceMiles: distanceMiles ?? this.distanceMiles,
      expiresAt: expiresAt ?? this.expiresAt,
      createdAt: createdAt ?? this.createdAt,
      status: status ?? this.status,
      isFeatured: isFeatured ?? this.isFeatured,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is FoodPostEntity && id == other.id;

  @override
  int get hashCode => id.hashCode;
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
