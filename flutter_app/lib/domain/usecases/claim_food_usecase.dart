import 'package:ecoeats/domain/entities/claim.dart';
import 'package:ecoeats/domain/repositories/claim_repository.dart';

/// Reserve portions of a food post.
///
/// This deliberately does nothing but forward the request. It used to read the
/// post, check the remaining quantity itself, create the claim, and then write
/// back `remaining - servings` — a read-modify-write across three round trips.
/// Two people claiming the last portion would both read the same number, both
/// pass the check, and both claim it; the final write then set a quantity that
/// was simply wrong.
///
/// The API exists in its current shape specifically to stop that: it takes a
/// row lock and decrements atomically, returns 409 when the stock has gone, and
/// is the only place that can see both claims at once. So the client must send
/// the request and trust the quantity that comes back — a client-side guard
/// here cannot be correct, and being *nearly* correct is worse, because it
/// hides the race until it corrupts inventory.
class ClaimFoodUseCase {
  final ClaimRepository _claimRepository;

  const ClaimFoodUseCase(this._claimRepository);

  Future<ClaimEntity> call({
    required String postId,
    required String userId,
    int servings = 1,
  }) {
    return _claimRepository.claimFood(
      postId: postId,
      userId: userId,
      servings: servings,
    );
  }
}
