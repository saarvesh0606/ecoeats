enum ClaimStatus { reserved, confirmed, pickedUp, expired, cancelled }

class ClaimEntity {
  final String id;
  final String postId;
  final String userId;
  final String postTitle;
  final String? postImageUrl;
  final String locationName;
  final String locationAddress;
  final ClaimStatus status;
  final DateTime claimedAt;
  final DateTime? pickupWindowStart;
  final DateTime? pickupWindowEnd;
  final int servingsClaimed;

  const ClaimEntity({
    required this.id,
    required this.postId,
    required this.userId,
    required this.postTitle,
    this.postImageUrl,
    required this.locationName,
    required this.locationAddress,
    this.status = ClaimStatus.reserved,
    required this.claimedAt,
    this.pickupWindowStart,
    this.pickupWindowEnd,
    this.servingsClaimed = 1,
  });

  bool get isActive =>
      status == ClaimStatus.reserved || status == ClaimStatus.confirmed;
  bool get isPickedUp => status == ClaimStatus.pickedUp;
  bool get isExpired => status == ClaimStatus.expired;

  Duration? get timeRemaining {
    if (pickupWindowEnd == null) return null;
    final diff = pickupWindowEnd!.difference(DateTime.now());
    return diff.isNegative ? Duration.zero : diff;
  }

  String get pickupTimeDisplay {
    if (pickupWindowStart == null || pickupWindowEnd == null) return '';
    final start = _formatTime(pickupWindowStart!);
    final end = _formatTime(pickupWindowEnd!);
    return '$start – $end';
  }

  String _formatTime(DateTime dt) {
    final hour = dt.hour;
    final minute = dt.minute.toString().padLeft(2, '0');
    final period = hour >= 12 ? 'PM' : 'AM';
    final displayHour = hour > 12 ? hour - 12 : (hour == 0 ? 12 : hour);
    return '$displayHour:$minute $period';
  }

  ClaimEntity copyWith({
    String? id,
    String? postId,
    String? userId,
    String? postTitle,
    String? postImageUrl,
    String? locationName,
    String? locationAddress,
    ClaimStatus? status,
    DateTime? claimedAt,
    DateTime? pickupWindowStart,
    DateTime? pickupWindowEnd,
    int? servingsClaimed,
  }) {
    return ClaimEntity(
      id: id ?? this.id,
      postId: postId ?? this.postId,
      userId: userId ?? this.userId,
      postTitle: postTitle ?? this.postTitle,
      postImageUrl: postImageUrl ?? this.postImageUrl,
      locationName: locationName ?? this.locationName,
      locationAddress: locationAddress ?? this.locationAddress,
      status: status ?? this.status,
      claimedAt: claimedAt ?? this.claimedAt,
      pickupWindowStart: pickupWindowStart ?? this.pickupWindowStart,
      pickupWindowEnd: pickupWindowEnd ?? this.pickupWindowEnd,
      servingsClaimed: servingsClaimed ?? this.servingsClaimed,
    );
  }

  // Status is part of equality for the same reason as on FoodPostEntity: a
  // claim that moves from reserved to picked up must be seen as different, or
  // the tab it belongs to never re-renders.
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ClaimEntity && id == other.id && status == other.status;

  @override
  int get hashCode => Object.hash(id, status);
}
