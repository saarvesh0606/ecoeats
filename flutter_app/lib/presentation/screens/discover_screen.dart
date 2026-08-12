import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/core/constants/app_fonts.dart';
import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/presentation/providers/posts_provider.dart';
import 'package:ecoeats/presentation/widgets/bottom_nav_bar.dart';
import 'package:ecoeats/presentation/widgets/food_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class DiscoverScreen extends ConsumerStatefulWidget {
  const DiscoverScreen({super.key});

  @override
  ConsumerState<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends ConsumerState<DiscoverScreen> {
  final _searchController = TextEditingController();
  int _selectedChip = 0;

  static const _chips = <(String, DietaryTag?)>[
    ('All', null),
    ('Vegetarian', DietaryTag.vegetarian),
    ('Vegan', DietaryTag.vegan),
    ('Gluten-Free', DietaryTag.glutenFree),
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _onChipSelected(int index) {
    setState(() => _selectedChip = index);
    final tag = _chips[index].$2;
    ref.read(postsFilterProvider.notifier).state =
        ref.read(postsFilterProvider).copyWith(tags: tag != null ? [tag] : []);
  }

  @override
  Widget build(BuildContext context) {
    final postsAsync = ref.watch(discoverPostsProvider);

    return Scaffold(
      backgroundColor: AppColors.backgroundCream,
      bottomNavigationBar: RecipientBottomNavBar(
        selectedItem: NavItem.discover,
        onItemSelected: (item) {
          if (item == NavItem.myClaims) context.go('/recipient/my-claims');
        },
      ),
      body: Column(
        children: [
          // The title stays put while the feed moves under it — it is the only
          // thing telling you which tab you are on once the cards fill the
          // screen.
          SafeArea(bottom: false, child: _buildTopBar()),
          Expanded(
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.md,
                      AppSpacing.sm,
                      AppSpacing.md,
                      AppSpacing.md,
                    ),
                    child: Column(
                      children: [
                        _buildSearchRow(),
                        const SizedBox(height: AppSpacing.md),
                        _buildChipsRow(),
                      ],
                    ),
                  ),
                ),
                _buildFeed(postsAsync),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.sm,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Discover',
                  style: AppFonts.display(
                    fontSize: 40,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primaryGreen,
                    height: 1.1,
                    letterSpacing: -0.5,
                  ),
                ).animate().fadeIn().slideX(begin: -0.1),
                const SizedBox(height: 2),
                Text(
                  'Good food. Good impact.',
                  style: AppFonts.body(
                    fontSize: 15,
                    color: AppColors.onSurfaceVariant,
                  ),
                ).animate(delay: 100.ms).fadeIn(),
              ],
            ),
          ),
          Stack(
            children: [
              IconButton(
                // Not yet wired: there is no notifications screen on this
                // client. The API already serves them.
                onPressed: () {},
                icon: const Icon(Icons.notifications_outlined, size: 28),
                color: AppColors.primaryGreen,
                padding: const EdgeInsets.all(8),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: AppColors.errorColor,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: AppColors.backgroundCream,
                      width: 2,
                    ),
                  ),
                ),
              ),
            ],
          ).animate(delay: 150.ms).fadeIn(),
        ],
      ),
    );
  }

  Widget _buildSearchRow() {
    return Row(
      children: [
        Expanded(
          child: Container(
            height: 48,
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(AppRadius.full),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.02),
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              children: [
                const SizedBox(width: 14),
                const Icon(
                  Icons.search_rounded,
                  size: 22,
                  color: AppColors.onSurfaceVariant,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    onChanged: (value) {
                      ref.read(postsFilterProvider.notifier).state = ref
                          .read(postsFilterProvider)
                          .copyWith(searchQuery: value);
                    },
                    style: AppFonts.body(
                      fontSize: 15,
                      color: AppColors.onSurface,
                    ),
                    decoration: InputDecoration(
                      hintText: 'Search food, meals, or locations',
                      hintStyle: AppFonts.body(
                        fontSize: 15,
                        color: AppColors.onSurfaceVariant,
                      ),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
              ],
            ),
          ),
        ),
        const SizedBox(width: 10),
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: AppColors.surfaceContainerHigh,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.02),
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: const Icon(
            Icons.tune_rounded,
            size: 22,
            color: AppColors.onSurface,
          ),
        ),
      ],
    );
  }

  Widget _buildChipsRow() {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _chips.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final label = _chips[i].$1;
          final isActive = i == _selectedChip;
          return GestureDetector(
            onTap: () => _onChipSelected(i),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              decoration: BoxDecoration(
                color: isActive
                    ? AppColors.primaryGreen
                    : AppColors.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(AppRadius.full),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.02),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              alignment: Alignment.center,
              child: Text(
                label,
                style: AppFonts.body(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  color: isActive ? Colors.white : AppColors.onSurfaceVariant,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildFeed(AsyncValue<List<FoodPostEntity>> postsAsync) {
    return postsAsync.when(
      data: (posts) {
        if (posts.isEmpty) return _buildEmptyState();
        return SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            0,
            AppSpacing.md,
            AppSpacing.xl,
          ),
          sliver: SliverList.separated(
            itemCount: posts.length,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.lg),
            itemBuilder: (context, index) {
              final post = posts[index];
              return FoodCard(
                post: post,
                onTap: () {
                  ref.read(selectedPostIdProvider.notifier).state = post.id;
                  context.push('/recipient/claim');
                },
              ).animate(delay: (index * 100).ms).fadeIn().slideY(begin: 0.1);
            },
          ),
        );
      },
      loading: () => const SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: CircularProgressIndicator(color: AppColors.primaryGreen),
        ),
      ),
      error: (_, __) => SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: Text(
            'Failed to load food nearby.',
            style: AppFonts.body(color: AppColors.onSurfaceVariant),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return SliverFillRemaining(
      hasScrollBody: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.no_meals_outlined,
              size: 48,
              color: AppColors.outlineColor,
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              'Nothing available right now',
              style: AppFonts.display(
                fontSize: 20,
                fontWeight: FontWeight.w500,
                color: AppColors.onSurface,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              'Food gets posted throughout the day — check back soon.',
              style: AppFonts.body(
                fontSize: 14,
                color: AppColors.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
