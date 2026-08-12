import 'package:ecoeats/data/api/api_client.dart';
import 'package:ecoeats/data/api/mappers.dart';
import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/domain/repositories/post_repository.dart';

/// Food posts, served by the live API.
class ApiPostRepository implements PostRepository {
  ApiPostRepository(this._client);

  final ApiClient _client;

  List<FoodPostEntity> _items(dynamic body) {
    final items = (body as Map?)?['items'] as List? ?? const [];
    return items
        .map((e) => foodPostFromApi((e as Map).cast<String, dynamic>()))
        .toList();
  }

  @override
  Future<List<FoodPostEntity>> getPosts({
    String? searchQuery,
    List<DietaryTag>? filters,
    double? lat,
    double? lng,
  }) async {
    final body = await _client.get('/listings', query: {
      if (searchQuery != null && searchQuery.trim().isNotEmpty)
        'q': searchQuery.trim(),
      if (filters != null && filters.isNotEmpty)
        'dietary': filters.map(dietaryToApi).toList(),
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
    });
    return _items(body);
  }

  @override
  Future<List<FoodPostEntity>> getHostPosts({
    required String hostId,
    PostStatus? status,
  }) async {
    // The API scopes this to the caller's own token — a host id in the query
    // would be ignored, and honouring one would be a way to read someone
    // else's posts.
    final body = await _client.get('/listings/mine');
    final posts = _items(body);
    if (status == null) return posts;
    return posts.where((p) => p.status == status).toList();
  }

  @override
  Future<FoodPostEntity?> getPostById(String id) async {
    try {
      final body = await _client.get('/listings/$id');
      return foodPostFromApi((body as Map).cast<String, dynamic>());
    } on ApiException catch (e) {
      // A post that has expired or been pulled is a normal outcome here, not
      // an error the caller should have to catch.
      if (e.isNotFound) return null;
      rethrow;
    }
  }

  @override
  Future<FoodPostEntity> createPost(FoodPostEntity post) async {
    final body = await _client.post(
      '/listings',
      body: createListingBody(post, lat: post.lat, lng: post.lng),
    );
    return foodPostFromApi((body as Map).cast<String, dynamic>());
  }

  @override
  Future<FoodPostEntity> updatePost(FoodPostEntity post) async {
    final body = await _client.patch('/listings/${post.id}', body: {
      'title': post.title,
      'description': post.description,
      'allergens': post.allergens,
      'dietary_tags': post.dietaryTags.map(dietaryToApi).toList(),
      'quantity_total': post.totalQuantity,
    });
    return foodPostFromApi((body as Map).cast<String, dynamic>());
  }

  @override
  Future<void> updatePostStatus(String postId, PostStatus status) async {
    // Ending a post is its own endpoint, not a status write — PATCH only
    // accepts active and claimed.
    if (status == PostStatus.ended) {
      await _client.post('/listings/$postId/cancel');
      return;
    }
    final value = postStatusToApi(status);
    if (value == null) {
      throw ApiException(null, 'Cannot set a post to ${status.name}.');
    }
    await _client.patch('/listings/$postId', body: {'status': value});
  }

  @override
  Future<void> updateQuantity(String postId, int remaining) async {
    // ⚠️ Deliberately not implemented. The remaining quantity is the server's
    // to move, under the row lock it takes when a claim comes in; writing it
    // from here is what the old client-side decrement did, and it is how the
    // v1 inventory corruption happened. A host changing how much food there is
    // sets quantity_total through updatePost instead.
    throw UnimplementedError(
      'Remaining quantity is owned by the server. '
      'Use updatePost to change the total, or claim/cancel to move stock.',
    );
  }

  @override
  Future<void> deletePost(String postId) => _client.post(
        '/listings/$postId/cancel',
      );

  @override
  Future<Map<String, int>> getHostImpact(String hostId) async {
    final body = await _client.get('/listings/impact');
    final map = (body as Map).cast<String, dynamic>();
    return {
      'mealsShared': (map['meals_shared'] as num?)?.toInt() ?? 0,
      'peopleFed': (map['people_fed'] as num?)?.toInt() ?? 0,
      'activePosts': (map['active_posts'] as num?)?.toInt() ?? 0,
      // No weight is collected anywhere server-side, so there is nothing
      // honest to report here. The dashboard shows a zero rather than a
      // plausible-looking invention.
      'foodSavedLbs': 0,
    };
  }
}
