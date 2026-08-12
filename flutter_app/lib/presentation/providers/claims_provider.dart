import 'package:ecoeats/domain/entities/claim.dart';
import 'package:ecoeats/domain/usecases/claim_food_usecase.dart';
import 'package:ecoeats/domain/usecases/get_my_claims_usecase.dart';
import 'package:ecoeats/presentation/providers/auth_provider.dart';
import 'package:ecoeats/presentation/providers/posts_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// ─── Use Case Providers ───────────────────────────────────────────────────────

final getMyClaimsUseCaseProvider = Provider<GetMyClaimsUseCase>((ref) {
  return GetMyClaimsUseCase(ref.watch(claimRepositoryProvider));
});

final claimFoodUseCaseProvider = Provider<ClaimFoodUseCase>((ref) {
  // Only the claim repository now — the post repository was here so the use
  // case could decrement the stock itself, which is the server's job.
  return ClaimFoodUseCase(ref.watch(claimRepositoryProvider));
});

// ─── Claims State ─────────────────────────────────────────────────────────────

enum ClaimsTab { active, pickedUp, expired }

final claimsTabProvider = StateProvider<ClaimsTab>((ref) => ClaimsTab.active);

final myClaimsProvider = FutureProvider<List<ClaimEntity>>((ref) {
  final tab = ref.watch(claimsTabProvider);
  final useCase = ref.watch(getMyClaimsUseCaseProvider);

  ClaimStatus? status;
  switch (tab) {
    case ClaimsTab.active:
      status = ClaimStatus.reserved;
      break;
    case ClaimsTab.pickedUp:
      status = ClaimStatus.pickedUp;
      break;
    case ClaimsTab.expired:
      status = ClaimStatus.expired;
      break;
  }

  return useCase(status: status);
});

// ─── Claim Food Notifier ──────────────────────────────────────────────────────

class ClaimFoodNotifier extends StateNotifier<AsyncValue<ClaimEntity?>> {
  final ClaimFoodUseCase _useCase;
  final Ref _ref;

  ClaimFoodNotifier(this._useCase, this._ref)
      : super(const AsyncValue.data(null));

  Future<ClaimEntity?> claim({
    required String postId,
    required String userId,
    int servings = 1,
  }) async {
    state = const AsyncValue.loading();
    final result = await AsyncValue.guard(() => _useCase(
          postId: postId,
          userId: userId,
          servings: servings,
        ));
    state = result;

    // Claiming changes what the rest of the app should be showing: one less
    // serving on the feed and on the post itself, one more row under My
    // Claims. Every FutureProvider here resolves once and caches forever, so
    // without this the screens keep serving the pre-claim answer until the app
    // is restarted. Invalidating from the notifier means no call site can
    // forget to.
    if (!result.hasError) {
      _ref.invalidate(discoverPostsProvider);
      _ref.invalidate(selectedPostProvider);
      _ref.invalidate(myClaimsProvider);
    }
    return result.valueOrNull;
  }

  void reset() {
    state = const AsyncValue.data(null);
  }
}

final claimFoodNotifierProvider =
    StateNotifierProvider<ClaimFoodNotifier, AsyncValue<ClaimEntity?>>((ref) {
  return ClaimFoodNotifier(ref.watch(claimFoodUseCaseProvider), ref);
});
