import 'package:ecoeats/domain/entities/claim.dart';
import 'package:ecoeats/domain/usecases/claim_food_usecase.dart';
import 'package:ecoeats/domain/usecases/get_my_claims_usecase.dart';
import 'package:ecoeats/presentation/providers/auth_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// ─── Use Case Providers ───────────────────────────────────────────────────────

final getMyClaimsUseCaseProvider = Provider<GetMyClaimsUseCase>((ref) {
  return GetMyClaimsUseCase(ref.watch(claimRepositoryProvider));
});

final claimFoodUseCaseProvider = Provider<ClaimFoodUseCase>((ref) {
  return ClaimFoodUseCase(
    ref.watch(claimRepositoryProvider),
    ref.watch(postRepositoryProvider),
  );
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

  ClaimFoodNotifier(this._useCase) : super(const AsyncValue.data(null));

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
    return result.valueOrNull;
  }

  void reset() {
    state = const AsyncValue.data(null);
  }
}

final claimFoodNotifierProvider =
    StateNotifierProvider<ClaimFoodNotifier, AsyncValue<ClaimEntity?>>((ref) {
  return ClaimFoodNotifier(ref.watch(claimFoodUseCaseProvider));
});
