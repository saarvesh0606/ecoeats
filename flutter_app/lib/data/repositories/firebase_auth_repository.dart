import 'package:ecoeats/domain/entities/user.dart';
import 'package:ecoeats/domain/repositories/auth_repository.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Real sign-in, against the same Firebase project the API verifies against.
///
/// The API will only accept a token whose email is verified *and* ends in
/// `@asu.edu`. Both rules are enforced here as well — not because the client is
/// trusted, but so a rejected account is told why at sign-in instead of
/// appearing to work and then failing on every request with an opaque 401.
class FirebaseAuthRepository implements AuthRepository {
  FirebaseAuthRepository(this._auth);

  final FirebaseAuth _auth;

  /// Firebase has no idea whether someone is hosting or collecting, and the
  /// API keeps role on its own user profile. Until that profile is read, the
  /// choice made at sign-in stands for the session.
  UserRole _role = UserRole.recipient;

  @override
  Stream<UserEntity?> get authStateChanges =>
      _auth.authStateChanges().map((user) => user == null ? null : _toEntity(user));

  @override
  Future<UserEntity?> getCurrentUser() async {
    final user = _auth.currentUser;
    return user == null ? null : _toEntity(user);
  }

  @override
  bool isValidAsuEmail(String email) =>
      email.toLowerCase().trim().endsWith('@asu.edu');

  @override
  Future<UserEntity> signIn({
    required String email,
    required String password,
    required UserRole role,
  }) async {
    final trimmed = email.trim();
    if (!isValidAsuEmail(trimmed)) {
      throw AuthFailure('EcoEats is for @asu.edu accounts.');
    }

    final UserCredential credential;
    try {
      credential = await _auth.signInWithEmailAndPassword(
        email: trimmed,
        password: password,
      );
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(_messageFor(e));
    }

    final user = credential.user;
    if (user == null) throw AuthFailure("Couldn't sign you in.");

    // The API rejects an unverified token outright, so stopping here gives a
    // reason rather than a wall of 401s on the next screen.
    if (!user.emailVerified) {
      await _auth.signOut();
      throw AuthFailure(
        'Please confirm your ASU email address, then sign in again.',
      );
    }

    _role = role;
    return _toEntity(user);
  }

  @override
  Future<void> signOut() => _auth.signOut();

  UserEntity _toEntity(User user) {
    final email = user.email ?? '';
    return UserEntity(
      id: user.uid,
      email: email,
      displayName: user.displayName?.trim().isNotEmpty == true
          ? user.displayName!
          : _nameFromEmail(email),
      role: _role,
      avatarUrl: user.photoURL,
    );
  }

  String _nameFromEmail(String email) {
    final local = email.split('@').first;
    return local
        .split('.')
        .map((p) => p.isEmpty ? '' : p[0].toUpperCase() + p.substring(1))
        .join(' ');
  }

  /// Firebase codes are precise but unreadable; these are what a person can
  /// act on. Wrong email and wrong password are deliberately given the same
  /// answer, so this cannot be used to find out which accounts exist.
  String _messageFor(FirebaseAuthException e) {
    switch (e.code) {
      case 'invalid-email':
        return "That doesn't look like an email address.";
      case 'user-disabled':
        return 'That account has been disabled.';
      case 'user-not-found':
      case 'wrong-password':
      case 'invalid-credential':
        return 'That email and password do not match.';
      case 'too-many-requests':
        return 'Too many attempts. Wait a moment and try again.';
      case 'network-request-failed':
        return "Couldn't reach Firebase. Check your connection.";
      default:
        return e.message ?? "Couldn't sign you in.";
    }
  }
}

/// A sign-in problem worth showing verbatim.
class AuthFailure implements Exception {
  AuthFailure(this.message);
  final String message;

  @override
  String toString() => message;
}
