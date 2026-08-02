import 'package:ecoeats/domain/entities/user.dart';

abstract class AuthRepository {
  /// Stream of the current authenticated user (null if not signed in)
  Stream<UserEntity?> get authStateChanges;

  /// Get the currently signed-in user
  Future<UserEntity?> getCurrentUser();

  /// Sign in with ASU email and role selection
  Future<UserEntity> signIn({
    required String email,
    required UserRole role,
  });

  /// Sign out the current user
  Future<void> signOut();

  /// Check if an email is a valid ASU email
  bool isValidAsuEmail(String email);
}
