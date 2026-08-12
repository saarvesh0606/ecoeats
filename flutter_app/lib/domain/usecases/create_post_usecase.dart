import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/domain/repositories/post_repository.dart';
import 'package:uuid/uuid.dart';

class CreatePostUseCase {
  final PostRepository _repository;
  final _uuid = const Uuid();

  CreatePostUseCase(this._repository);

  Future<FoodPostEntity> call({
    required String hostId,
    required String hostName,
    required String title,
    required String description,
    required int quantity,
    required List<DietaryTag> dietaryTags,
    required String locationName,
    required String locationAddress,
    String? locationNotes,
    List<String> imageUrls = const [],
    DateTime? expiresAt,
  }) async {
    if (title.trim().isEmpty) {
      throw Exception('Post title cannot be empty');
    }
    if (quantity <= 0) {
      throw Exception('Quantity must be at least 1');
    }

    final post = FoodPostEntity(
      id: _uuid.v4(),
      hostId: hostId,
      hostName: hostName,
      title: title.trim(),
      description: description.trim(),
      imageUrls: imageUrls,
      totalQuantity: quantity,
      remainingQuantity: quantity,
      dietaryTags: dietaryTags,
      locationName: locationName,
      locationAddress: locationAddress,
      locationNotes: locationNotes,
      // Six hours was the old default and the API would never have accepted it.
      expiresAt: expiresAt ??
          DateTime.now().add(Duration(minutes: kExpiryWindowMinutes.last)),
      createdAt: DateTime.now(),
      status: PostStatus.live,
    );

    return _repository.createPost(post);
  }
}
