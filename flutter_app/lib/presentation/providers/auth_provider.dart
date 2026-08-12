import 'package:ecoeats/core/firebase_options.dart';
import 'package:ecoeats/data/api/api_client.dart';
import 'package:ecoeats/data/repositories/api_claim_repository.dart';
import 'package:ecoeats/data/repositories/api_post_repository.dart';
import 'package:ecoeats/data/repositories/firebase_auth_repository.dart';
import 'package:ecoeats/data/repositories/mock_auth_repository.dart';
import 'package:ecoeats/data/repositories/mock_claim_repository.dart';
import 'package:ecoeats/data/repositories/mock_post_repository.dart';
import 'package:ecoeats/domain/entities/user.dart';
import 'package:ecoeats/domain/repositories/auth_repository.dart';
import 'package:ecoeats/domain/repositories/claim_repository.dart';
import 'package:ecoeats/domain/repositories/post_repository.dart';
import 'package:ecoeats/domain/usecases/sign_in_usecase.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Whether to talk to the real API instead of the in-memory mocks.
///
///     flutter run --dart-define-from-file=dart_define.json
///
/// Off by default. The API only accepts a verified `@asu.edu` Firebase token,
/// so this needs the Firebase config supplied in the same file — turning it on
/// without that gets a wall of 401s rather than data.
const bool kUseApi = bool.fromEnvironment('ECOEATS_USE_API');

// ─── API plumbing ─────────────────────────────────────────────────────────────

/// Where the bearer token comes from.
///
/// Firebase mints a short-lived ID token and refreshes it on demand, so this
/// asks for the current one per request rather than caching it — a cached
/// token starts returning 401 about an hour in.
final authTokenProvider = Provider<TokenProvider>((ref) {
  if (!DefaultFirebaseOptions.isConfigured) return () async => null;
  return () async => FirebaseAuth.instance.currentUser?.getIdToken();
});

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(tokenProvider: ref.watch(authTokenProvider));
});

// ─── Repository Providers ────────────────────────────────────────────────────

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  // Tied to whether Firebase was actually configured, not to kUseApi: a build
  // without the config would otherwise construct a repository whose every call
  // throws on a missing API key. Missing config degrades to the mock rather
  // than to a crash.
  return DefaultFirebaseOptions.isConfigured
      ? FirebaseAuthRepository(FirebaseAuth.instance)
      : MockAuthRepository();
});

final postRepositoryProvider = Provider<PostRepository>((ref) {
  return kUseApi
      ? ApiPostRepository(ref.watch(apiClientProvider))
      : MockPostRepository();
});

final claimRepositoryProvider = Provider<ClaimRepository>((ref) {
  return kUseApi
      ? ApiClaimRepository(ref.watch(apiClientProvider))
      : MockClaimRepository();
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
    required String password,
    required UserRole role,
  }) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => _signInUseCase(email: email, password: password, role: role),
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
