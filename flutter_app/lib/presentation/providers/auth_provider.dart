import 'package:ecoeats/data/repositories/mock_auth_repository.dart';
import 'package:ecoeats/data/repositories/mock_claim_repository.dart';
import 'package:ecoeats/data/repositories/mock_post_repository.dart';
import 'package:ecoeats/domain/entities/user.dart';
import 'package:ecoeats/domain/repositories/auth_repository.dart';
import 'package:ecoeats/domain/repositories/claim_repository.dart';
import 'package:ecoeats/domain/repositories/post_repository.dart';
import 'package:ecoeats/domain/usecases/sign_in_usecase.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// ─── Repository Providers ────────────────────────────────────────────────────

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return MockAuthRepository();
});

final postRepositoryProvider = Provider<PostRepository>((ref) {
  return MockPostRepository();
});

final claimRepositoryProvider = Provider<ClaimRepository>((ref) {
  return MockClaimRepository();
});

// ─── Use Case Providers ───────────────────────────────────────────────────────

final signInUseCaseProvider = Provider<SignInUseCase>((ref) {
  return SignInUseCase(ref.watch(authRepositoryProvider));
});

// ─── Auth State ───────────────────────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AsyncValue<UserEntity?>> {
  final AuthRepository _authRepository;
  final SignInUseCase _signInUseCase;

  AuthNotifier(this._authRepository, this._signInUseCase)
      : super(const AsyncValue.data(null));

  Future<void> signIn({
    required String email,
    required UserRole role,
  }) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => _signInUseCase(email: email, role: role),
    );
  }

  Future<void> signOut() async {
    await _authRepository.signOut();
    state = const AsyncValue.data(null);
  }
}

final authNotifierProvider =
    StateNotifierProvider<AuthNotifier, AsyncValue<UserEntity?>>((ref) {
  return AuthNotifier(
    ref.watch(authRepositoryProvider),
    ref.watch(signInUseCaseProvider),
  );
});

final currentUserProvider = Provider<UserEntity?>((ref) {
  return ref.watch(authNotifierProvider).valueOrNull;
});
