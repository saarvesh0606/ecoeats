import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/presentation/providers/posts_provider.dart';
import 'package:ecoeats/presentation/widgets/bottom_nav_bar.dart';
import 'package:ecoeats/presentation/widgets/food_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

class DiscoverScreen extends ConsumerStatefulWidget {
  const DiscoverScreen({super.key});

  @override
  ConsumerState<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends ConsumerState<DiscoverScreen> {
  final _searchController = TextEditingController();
  int _selectedChip = 0;

  final List<(String, DietaryTag?)> _chips = [
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
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: _buildTopBar(),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  children: [
                    _buildSearchRow(),
                    const SizedBox(height: 12),
                    _buildChipsRow(),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
            postsAsync.when(
              data: (posts) => SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final post = posts[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 20),
                        child: FoodCard(
                          post: post,
                          onTap: () {
                            ref.read(selectedPostIdProvider.notifier).state = post.id;
                            context.push('/recipient/claim');
                          },
                        )
                            .animate(delay: (index * 100).ms)
                            .fadeIn()
                            .slideY(begin: 0.1),
                      );
                    },
                    childCount: posts.length,
                  ),
                ),
              ),
              loading: () => const SliverFillRemaining(
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.primaryGreen),
                ),
              ),
              error: (e, _) => SliverFillRemaining(
                child: Center(
                  child: Text(
                    'Failed to load posts',
                    style: GoogleFonts.hankenGrotesk(color: AppColors.onSurfaceVariant),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Discover',
                style: GoogleFonts.ebGaramond(
                  fontSize: 40,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primaryGreen,
                  height: 1,
                  letterSpacing: -0.5,
                ),
              ).animate().fadeIn().slideX(begin: -0.1),
              Text(
                'Good food. Good impact.',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 15,
                  color: AppColors.onSurfaceVariant,
                ),
              ).animate(delay: 100.ms).fadeIn(),
            ],
          ),
          Stack(
            children: [
              IconButton(
                onPressed: () {},
                icon: const Icon(Icons.notifications_outlined, size: 26),
                color: AppColors.primaryGreen,
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
                    border: Border.all(color: AppColors.backgroundCream, width: 1.5),
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
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(100),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.02),
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: TextField(
              controller: _searchController,
              onChanged: (v) {
                ref.read(postsFilterProvider.notifier).state =
                    ref.read(postsFilterProvider).copyWith(searchQuery: v);
              },
              style: GoogleFonts.hankenGrotesk(
                fontSize: 15,
                color: AppColors.onSurface,
              ),
              decoration: InputDecoration(
                hintText: 'Search food, meals, or locations',
                hintStyle: GoogleFonts.hankenGrotesk(
                  fontSize: 15,
                  color: AppColors.onSurfaceVariant,
                ),
                prefixIcon: const Icon(Icons.search, color: AppColors.onSurfaceVariant),
                filled: false,
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
              ),
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
                color: Colors.black.withOpacity(0.02),
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: const Icon(Icons.tune, color: AppColors.onSurface, size: 20),
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
          final (label, tag) = _chips[i];
          final isSelected = _selectedChip == i;
          return GestureDetector(
            onTap: () {
              setState(() => _selectedChip = i);
              ref.read(postsFilterProvider.notifier).state =
                  ref.read(postsFilterProvider).copyWith(
                    tags: tag != null ? [tag] : [],
                  );
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.primaryGreen : AppColors.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(100),
              ),
              child: Text(
                label,
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: isSelected ? Colors.white : AppColors.onSurfaceVariant,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
