import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/domain/usecases/create_post_usecase.dart';
import 'package:ecoeats/domain/usecases/get_posts_usecase.dart';
import 'package:ecoeats/domain/usecases/manage_post_usecase.dart';
import 'package:ecoeats/presentation/providers/auth_provider.dart';
// postRepositoryProvider is re-exported from auth_provider since it's defined there
import 'package:flutter_riverpod/flutter_riverpod.dart';

// ─── Use Case Providers ───────────────────────────────────────────────────────

final getPostsUseCaseProvider = Provider<GetPostsUseCase>((ref) {
  return GetPostsUseCase(ref.watch(postRepositoryProvider));
});

final createPostUseCaseProvider = Provider<CreatePostUseCase>((ref) {
  return CreatePostUseCase(ref.watch(postRepositoryProvider));
});

final managePostUseCaseProvider = Provider<ManagePostUseCase>((ref) {
  return ManagePostUseCase(ref.watch(postRepositoryProvider));
});

// ─── Discover Posts ───────────────────────────────────────────────────────────

class PostsFilter {
  final String? searchQuery;
  final List<DietaryTag> tags;

  const PostsFilter({this.searchQuery, this.tags = const []});

  PostsFilter copyWith({String? searchQuery, List<DietaryTag>? tags}) {
    return PostsFilter(
      searchQuery: searchQuery ?? this.searchQuery,
      tags: tags ?? this.tags,
    );
  }
}

final postsFilterProvider = StateProvider<PostsFilter>((ref) {
  return const PostsFilter();
});

final discoverPostsProvider = FutureProvider<List<FoodPostEntity>>((ref) {
  final filter = ref.watch(postsFilterProvider);
  final useCase = ref.watch(getPostsUseCaseProvider);
  return useCase(
    searchQuery: filter.searchQuery,
    filters: filter.tags.isEmpty ? null : filter.tags,
  );
});

// ─── Selected Post ────────────────────────────────────────────────────────────

final selectedPostIdProvider = StateProvider<String?>((ref) => null);

final selectedPostProvider = FutureProvider<FoodPostEntity?>((ref) async {
  final postId = ref.watch(selectedPostIdProvider);
  if (postId == null) return null;
  final repo = ref.watch(postRepositoryProvider);
  return repo.getPostById(postId);
});

// ─── Host Posts ───────────────────────────────────────────────────────────────

enum HostPostsTab { active, scheduled, past }

final hostPostsTabProvider = StateProvider<HostPostsTab>(
  (ref) => HostPostsTab.active,
);

/// Which of a host's posts belong under each tab.
///
/// Kept beside the tab state rather than in the screen so the counts on the
/// tabs and the rows beneath them can never disagree — they previously did,
/// with the labels hardcoded to "Active (3)" above a list that was empty.
List<FoodPostEntity> postsForTab(List<FoodPostEntity> posts, HostPostsTab tab) {
  switch (tab) {
    case HostPostsTab.active:
      return posts.where((p) => p.status == PostStatus.live).toList();
    case HostPostsTab.scheduled:
      return posts.where((p) => p.status == PostStatus.scheduled).toList();
    case HostPostsTab.past:
      return posts
          .where((p) =>
              p.status == PostStatus.ended || p.status == PostStatus.outOfStock)
          .toList();
  }
}

final hostPostsProvider = FutureProvider<List<FoodPostEntity>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return Future.value([]);
  final useCase = ref.watch(managePostUseCaseProvider);
  return useCase.getHostPosts(user.id);
});

final hostImpactProvider = FutureProvider<Map<String, int>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return Future.value({'mealsShared': 0, 'foodSavedLbs': 0, 'peopleFed': 0});
  final useCase = ref.watch(managePostUseCaseProvider);
  return useCase.getWeeklyImpact(user.id);
});

// ─── Post Draft (for Create Post flow) ───────────────────────────────────────

class PostDraft {
  final String title;
  final String description;
  final int quantity;
  final List<DietaryTag> dietaryTags;
  final String locationName;
  final String locationAddress;
  final String? locationNotes;
  final List<String> imageUrls;
  final DateTime? expiresAt;

  const PostDraft({
    this.title = '',
    this.description = '',
    this.quantity = 1,
    this.dietaryTags = const [],
    this.locationName = '',
    this.locationAddress = '',
    this.locationNotes,
    this.imageUrls = const [],
    this.expiresAt,
  });

  PostDraft copyWith({
    String? title,
    String? description,
    int? quantity,
    List<DietaryTag>? dietaryTags,
    String? locationName,
    String? locationAddress,
    String? locationNotes,
    List<String>? imageUrls,
    DateTime? expiresAt,
  }) {
    return PostDraft(
      title: title ?? this.title,
      description: description ?? this.description,
      quantity: quantity ?? this.quantity,
      dietaryTags: dietaryTags ?? this.dietaryTags,
      locationName: locationName ?? this.locationName,
      locationAddress: locationAddress ?? this.locationAddress,
      locationNotes: locationNotes ?? this.locationNotes,
      imageUrls: imageUrls ?? this.imageUrls,
      expiresAt: expiresAt ?? this.expiresAt,
    );
  }
}

final postDraftProvider = StateProvider<PostDraft>((ref) => const PostDraft());

// ─── Create Post Notifier ─────────────────────────────────────────────────────

class CreatePostNotifier extends StateNotifier<AsyncValue<FoodPostEntity?>> {
  final CreatePostUseCase _useCase;
  final Ref _ref;

  CreatePostNotifier(this._useCase, this._ref)
      : super(const AsyncValue.data(null));

  Future<FoodPostEntity?> publishPost({
    required String hostId,
    required String hostName,
    required PostDraft draft,
  }) async {
    state = const AsyncValue.loading();
    final result = await AsyncValue.guard(() => _useCase(
          hostId: hostId,
          hostName: hostName,
          title: draft.title,
          description: draft.description,
          quantity: draft.quantity,
          dietaryTags: draft.dietaryTags,
          locationName: draft.locationName,
          locationAddress: draft.locationAddress,
          locationNotes: draft.locationNotes,
          imageUrls: draft.imageUrls,
          expiresAt: draft.expiresAt,
        ));
    state = result;

    // A published post has to appear on the host's own dashboard and on the
    // recipient feed, and it moves the impact numbers. None of those refetch
    // on their own.
    if (!result.hasError) {
      _ref.invalidate(hostPostsProvider);
      _ref.invalidate(discoverPostsProvider);
      _ref.invalidate(hostImpactProvider);
    }
    return result.valueOrNull;
  }
}

final createPostNotifierProvider =
    StateNotifierProvider<CreatePostNotifier, AsyncValue<FoodPostEntity?>>((ref) {
  return CreatePostNotifier(ref.watch(createPostUseCaseProvider), ref);
});
