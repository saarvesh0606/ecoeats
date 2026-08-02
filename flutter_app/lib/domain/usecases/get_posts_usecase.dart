import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/domain/repositories/post_repository.dart';

class GetPostsUseCase {
  final PostRepository _repository;

  const GetPostsUseCase(this._repository);

  Future<List<FoodPostEntity>> call({
    String? searchQuery,
    List<DietaryTag>? filters,
  }) async {
    final posts = await _repository.getPosts(
      searchQuery: searchQuery,
      filters: filters,
    );
    // Sort: featured first, then by time remaining
    return posts
      ..sort((a, b) {
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        return a.minutesLeft.compareTo(b.minutesLeft);
      });
  }
}
