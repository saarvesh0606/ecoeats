import 'package:ecoeats/domain/entities/food_post.dart';

abstract class PostRepository {
  /// Get all live food posts (for recipients to discover)
  Future<List<FoodPostEntity>> getPosts({
    String? searchQuery,
    List<DietaryTag>? filters,
  });

  /// Get all posts created by a specific host
  Future<List<FoodPostEntity>> getHostPosts({
    required String hostId,
    PostStatus? status,
  });

  /// Get a single post by ID
  Future<FoodPostEntity?> getPostById(String id);

  /// Create a new food post (host)
  Future<FoodPostEntity> createPost(FoodPostEntity post);

  /// Update an existing post
  Future<FoodPostEntity> updatePost(FoodPostEntity post);

  /// Update post status (mark as out of stock, end early, etc.)
  Future<void> updatePostStatus(String postId, PostStatus status);

  /// Update remaining quantity
  Future<void> updateQuantity(String postId, int remaining);

  /// Delete a post
  Future<void> deletePost(String postId);

  /// Get impact metrics for a host
  Future<Map<String, int>> getHostImpact(String hostId);
}
