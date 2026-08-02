enum UserRole { host, recipient }

class UserEntity {
  final String id;
  final String email;
  final String displayName;
  final UserRole role;
  final String? avatarUrl;
  final double rating;
  final int totalShares;

  const UserEntity({
    required this.id,
    required this.email,
    required this.displayName,
    required this.role,
    this.avatarUrl,
    this.rating = 5.0,
    this.totalShares = 0,
  });

  bool get isHost => role == UserRole.host;
  bool get isRecipient => role == UserRole.recipient;

  UserEntity copyWith({
    String? id,
    String? email,
    String? displayName,
    UserRole? role,
    String? avatarUrl,
    double? rating,
    int? totalShares,
  }) {
    return UserEntity(
      id: id ?? this.id,
      email: email ?? this.email,
      displayName: displayName ?? this.displayName,
      role: role ?? this.role,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      rating: rating ?? this.rating,
      totalShares: totalShares ?? this.totalShares,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is UserEntity && id == other.id;

  @override
  int get hashCode => id.hashCode;
}
