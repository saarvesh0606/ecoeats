import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/domain/repositories/post_repository.dart';

class MockPostRepository implements PostRepository {
  final List<FoodPostEntity> _posts = _generateMockPosts();

  static List<FoodPostEntity> _generateMockPosts() {
    final now = DateTime.now();
    return [
      FoodPostEntity(
        id: 'post_001',
        hostId: 'host_001',
        hostName: 'Taylor M.',
        hostRating: 4.9,
        hostAvatarUrl:
            'https://lh3.googleusercontent.com/aida-public/AB6AXuCwAKyXFNWNzj_b37553ibxDnmR5xtcGP3Mw8FOGhfAeZYwjQEZ-ubKUgCHgq6rWLvSNS4LeVqva_vcxqAp2FqZgGccLvQKE0WrwDExES-mHewAFdaJvDMGor_lrbIx5SvtUqXFUfHRqwgOOHVdOSYUpAeuJ4pyWdZ3l1fv1rOSacguJx7d3dXVSTF7vVWnJatXifv2Rg_GwHGEPG45_JrubLSOFnjMRJ8n5e8aVKhzqclSQ8dcS30PQw',
        title: 'Mediterranean Grain Bowl',
        description:
            'Fresh grains, roasted veggies, hummus, tahini dressing, and feta. Freshly made this morning. Great option for lunch!',
        imageUrls: [
          'https://lh3.googleusercontent.com/aida-public/AB6AXuDRCHsinZkphEoPsa0Jo1XCpNtvI5RZQc3WV7kDvhVrvCnZhoWYuTgkI-AGCSaTtzd59040ludUe1gifRBLbkmIkReMexstr157-rCxA1P1ySP6dDd07lZ26TKo0Socc5qR3D9m16JBd-Em6Dh_zaJRTWTDgdJjvPBcEgiH4-4Odvdb8KOaN4OISSQ8-kS4oSJquJcS7k1D4tXq8sBQaG5TmCg_DTHoRf0CrTBAu4k9HsAOOnH0HsuCbQ',
        ],
        totalQuantity: 45,
        remainingQuantity: 32,
        dietaryTags: [DietaryTag.vegetarian, DietaryTag.glutenFree, DietaryTag.containsDairy],
        locationName: 'Memorial Union – MU Market',
        locationAddress: '301 E Orange Mall, Tempe, AZ 85281',
        locationNotes: 'Inside Market Pickup Shelf',
        distanceMiles: 0.3,
        expiresAt: now.add(const Duration(minutes: 28)),
        createdAt: now.subtract(const Duration(hours: 2)),
        status: PostStatus.live,
        isFeatured: true,
      ),
      FoodPostEntity(
        id: 'post_002',
        hostId: 'host_002',
        hostName: 'Jordan K.',
        hostRating: 4.7,
        title: 'Pasta Primavera',
        description:
            'Fresh pasta primavera with seasonal vegetables and herbs. Vegetarian-friendly.',
        imageUrls: [
          'https://lh3.googleusercontent.com/aida-public/AB6AXuDStacsLmlmtxqCedHxhCUsgLENo2nq6QUGKSlXBr3klEOjSp5ZL0UQtsRaeXVf0vIrBdYaXBU2sgA_ol08tkBwHzc19jAl5XHu9qsnIVsWp-nfYxhXKm3LQLe6YukdNA-yZj1EKBsYywdAXHUdDUdxL_dA62OCORGdVW-9R94SLMJa69zZmoSQsjUkJIAJODnUsZ9sW0C6V-NRq0d-SpxtilvpJFXLOmj7ckzz4z7aTcnpLvdNqp4tRA',
        ],
        totalQuantity: 30,
        remainingQuantity: 18,
        dietaryTags: [DietaryTag.vegetarian],
        locationName: 'West Campus Café',
        locationAddress: '650 E Tyler Mall, Tempe, AZ 85281',
        distanceMiles: 0.6,
        expiresAt: now.add(const Duration(minutes: 45)),
        createdAt: now.subtract(const Duration(hours: 1)),
        status: PostStatus.live,
        isFeatured: false,
      ),
      FoodPostEntity(
        id: 'post_003',
        hostId: 'host_001',
        hostName: 'Taylor M.',
        hostRating: 4.9,
        title: 'Breakfast Pastries',
        description:
            'Assorted breakfast pastries from this morning — croissants, muffins, and scones.',
        imageUrls: [
          'https://lh3.googleusercontent.com/aida-public/AB6AXuCPLNBi8BJ30FzyaFB3M0HEQosBJ3_-8JICpsEc9pj39OKb68rxM_POhJwyOaLOWsMnSBaU8QoKofc1m4iRvXqIGTXtF3nwvuZyuF2Ybb-fRD-H6WgsX1-KeaHORLTRs1sUWe0HMKUKPFRa_YqXKnfXCnl2VnPyP387SbfLzLJEqngej8rx5I0xVmUw6TET7FMJ6jJCNYniQjdSgMQCnC5SzUzVLE8p_DhN1kiaOr_EbKEUXF1KVlAVNg',
        ],
        totalQuantity: 12,
        remainingQuantity: 8,
        dietaryTags: [DietaryTag.containsDairy],
        locationName: 'Taylor Place Dining',
        locationAddress: '225 E Apache Blvd, Tempe, AZ 85281',
        distanceMiles: 0.2,
        expiresAt: now.add(const Duration(minutes: 15)),
        createdAt: now.subtract(const Duration(hours: 3)),
        status: PostStatus.live,
        isFeatured: false,
      ),
    ];
  }

  @override
  Future<List<FoodPostEntity>> getPosts({
    String? searchQuery,
    List<DietaryTag>? filters,
  }) async {
    await Future.delayed(const Duration(milliseconds: 400));
    var result = List<FoodPostEntity>.from(_posts);

    if (searchQuery != null && searchQuery.isNotEmpty) {
      final q = searchQuery.toLowerCase();
      result = result.where((p) {
        return p.title.toLowerCase().contains(q) ||
            p.description.toLowerCase().contains(q) ||
            p.locationName.toLowerCase().contains(q);
      }).toList();
    }

    if (filters != null && filters.isNotEmpty) {
      result = result.where((p) {
        return filters.any((f) => p.dietaryTags.contains(f));
      }).toList();
    }

    return result;
  }

  @override
  Future<List<FoodPostEntity>> getHostPosts({
    required String hostId,
    PostStatus? status,
  }) async {
    await Future.delayed(const Duration(milliseconds: 300));
    var result = _posts.where((p) => p.hostId == hostId).toList();
    if (status != null) {
      result = result.where((p) => p.status == status).toList();
    }
    return result;
  }

  @override
  Future<FoodPostEntity?> getPostById(String id) async {
    await Future.delayed(const Duration(milliseconds: 200));
    try {
      return _posts.firstWhere((p) => p.id == id);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<FoodPostEntity> createPost(FoodPostEntity post) async {
    await Future.delayed(const Duration(milliseconds: 600));
    _posts.add(post);
    return post;
  }

  @override
  Future<FoodPostEntity> updatePost(FoodPostEntity post) async {
    await Future.delayed(const Duration(milliseconds: 400));
    final index = _posts.indexWhere((p) => p.id == post.id);
    if (index != -1) _posts[index] = post;
    return post;
  }

  @override
  Future<void> updatePostStatus(String postId, PostStatus status) async {
    await Future.delayed(const Duration(milliseconds: 300));
    final index = _posts.indexWhere((p) => p.id == postId);
    if (index != -1) {
      _posts[index] = _posts[index].copyWith(status: status);
    }
  }

  @override
  Future<void> updateQuantity(String postId, int remaining) async {
    await Future.delayed(const Duration(milliseconds: 200));
    final index = _posts.indexWhere((p) => p.id == postId);
    if (index != -1) {
      _posts[index] = _posts[index].copyWith(remainingQuantity: remaining);
    }
  }

  @override
  Future<void> deletePost(String postId) async {
    await Future.delayed(const Duration(milliseconds: 300));
    _posts.removeWhere((p) => p.id == postId);
  }

  @override
  Future<Map<String, int>> getHostImpact(String hostId) async {
    await Future.delayed(const Duration(milliseconds: 200));
    return {
      'mealsShared': 12,
      'foodSavedLbs': 5,
      'peopleFed': 48,
    };
  }
}
