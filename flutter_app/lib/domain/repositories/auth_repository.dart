import 'package:ecoeats/domain/entities/user.dart';

abstract class AuthRepository {
  /// Stream of the current authenticated user (null if not signed in)
  Stream<UserEntity?> get authStateChanges;

  /// Get the currently signed-in user
  Future<UserEntity?> getCurrentUser();

  /// Sign in with an ASU email, a password, and the role being used.
  ///
  /// The password is required because the API only accepts a verified Firebase
  /// token — there is no way to authenticate from an email address alone.
  Future<UserEntity> signIn({
    required String email,
    required String password,
    required UserRole role,
  });

  /// Sign out the current user
  Future<void> signOut();

  /// Check if an email is a valid ASU email
  bool isValidAsuEmail(String email);
}
