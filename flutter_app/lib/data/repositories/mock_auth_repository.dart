import 'dart:async';
import 'package:ecoeats/domain/entities/user.dart';
import 'package:ecoeats/domain/repositories/auth_repository.dart';

class MockAuthRepository implements AuthRepository {
  UserEntity? _currentUser;
  final _controller = StreamController<UserEntity?>.broadcast();

  @override
  Stream<UserEntity?> get authStateChanges => _controller.stream;

  @override
  Future<UserEntity?> getCurrentUser() async => _currentUser;

  @override
  Future<UserEntity> signIn({
    required String email,
    // Ignored: there is nothing to check it against. Kept so the mock and the
    // real repository stay interchangeable.
    required String password,
    required UserRole role,
  }) async {
    await Future.delayed(const Duration(milliseconds: 800));
    final user = UserEntity(
      // Hosts get the fixed id the seeded posts are owned by. A timestamp id
      // never matched `hostId: 'host_001'`, so the host dashboard filtered its
      // own posts out and was empty on every run — the tabs above it still
      // counted them, which is what made it look like a rendering fault rather
      // than an identity one. Recipients have nothing keyed to them, so a
      // unique id is still fine there.
      id: role == UserRole.host
          ? 'host_001'
          : 'user_${DateTime.now().millisecondsSinceEpoch}',
      email: email,
      displayName: _nameFromEmail(email),
      role: role,
      rating: 4.9,
      totalShares: role == UserRole.host ? 12 : 0,
    );
    _currentUser = user;
    _controller.add(user);
    return user;
  }

  @override
  Future<void> signOut() async {
    _currentUser = null;
    _controller.add(null);
  }

  @override
  bool isValidAsuEmail(String email) {
    return email.toLowerCase().trim().endsWith('@asu.edu');
  }

  String _nameFromEmail(String email) {
    final local = email.split('@').first;
    final parts = local.split('.');
    return parts
        .map((p) => p.isEmpty ? '' : p[0].toUpperCase() + p.substring(1))
        .join(' ');
  }

  void dispose() {
    _controller.close();
  }
}
