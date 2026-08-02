import 'package:ecoeats/domain/entities/claim.dart';
import 'package:ecoeats/domain/repositories/claim_repository.dart';
import 'package:ecoeats/domain/repositories/post_repository.dart';

class ClaimFoodUseCase {
  final ClaimRepository _claimRepository;
  final PostRepository _postRepository;

  const ClaimFoodUseCase(this._claimRepository, this._postRepository);

  Future<ClaimEntity> call({
    required String postId,
    required String userId,
    int servings = 1,
  }) async {
    final post = await _postRepository.getPostById(postId);
    if (post == null) throw Exception('Food post not found');
    if (!post.hasStock) throw Exception('Sorry, this item is no longer available');
    if (post.remainingQuantity < servings) {
      throw Exception('Only ${post.remainingQuantity} servings remaining');
    }

    final claim = await _claimRepository.claimFood(
      postId: postId,
      userId: userId,
      servings: servings,
    );

    // Update remaining quantity
    await _postRepository.updateQuantity(
      postId,
      post.remainingQuantity - servings,
    );

    return claim;
  }
}
