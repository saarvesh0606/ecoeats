import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/domain/repositories/post_repository.dart';

class ManagePostUseCase {
  final PostRepository _repository;

  const ManagePostUseCase(this._repository);

  /// Mark a post as out of stock
  Future<void> markOutOfStock(String postId) async {
    await _repository.updatePostStatus(postId, PostStatus.outOfStock);
    await _repository.updateQuantity(postId, 0);
  }

  /// End a post early
  Future<void> endPostEarly(String postId) async {
    await _repository.updatePostStatus(postId, PostStatus.ended);
  }

  /// Update the quantity remaining
  Future<void> adjustQuantity(String postId, int newQuantity) async {
    if (newQuantity < 0) throw Exception('Quantity cannot be negative');
    await _repository.updateQuantity(postId, newQuantity);
    if (newQuantity == 0) {
      await _repository.updatePostStatus(postId, PostStatus.outOfStock);
    }
  }

  /// Get host's posts by status
  Future<List<FoodPostEntity>> getHostPosts(String hostId, {PostStatus? status}) {
    return _repository.getHostPosts(hostId: hostId, status: status);
  }

  /// Get weekly impact metrics
  Future<Map<String, int>> getWeeklyImpact(String hostId) {
    return _repository.getHostImpact(hostId);
  }
}
