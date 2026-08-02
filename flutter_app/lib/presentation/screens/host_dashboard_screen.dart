import 'package:cached_network_image/cached_network_image.dart';
import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/presentation/providers/auth_provider.dart';
import 'package:ecoeats/presentation/providers/posts_provider.dart';
import 'package:ecoeats/presentation/widgets/bottom_nav_bar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

class HostDashboardScreen extends ConsumerWidget {
  const HostDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final impactAsync = ref.watch(hostImpactProvider);
    final postsAsync = ref.watch(hostPostsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFFAF8F5),
      bottomNavigationBar: HostBottomNavBar(
        selectedIndex: 0,
        onItemSelected: (i) {
          if (i == 2) context.push('/host/create-post');
        },
      ),
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(context, ref, user?.displayName ?? 'Sun Devil'),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    impactAsync.when(
                      data: (impact) => _buildImpactCard(impact)
                          .animate()
                          .fadeIn()
                          .slideY(begin: 0.1),
                      loading: () => const SizedBox(
                        height: 120,
                        child: Center(
                          child: CircularProgressIndicator(
                            color: AppColors.primaryGreen,
                          ),
                        ),
                      ),
                      error: (_, __) => const SizedBox.shrink(),
                    ),
                    const SizedBox(height: 20),
                    _buildTabs(),
                    const SizedBox(height: 16),
                    Text(
                      'Your Active Posts',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 12),
                    postsAsync.when(
                      data: (posts) => _buildPostList(context, posts),
                      loading: () => const Center(
                        child: CircularProgressIndicator(
                          color: AppColors.primaryGreen,
                        ),
                      ),
                      error: (_, __) => const Text('Failed to load posts'),
                    ),
                    const SizedBox(height: 20),
                    _buildCreateButton(context),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, WidgetRef ref, String name) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
      child: Row(
        children: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.menu),
            color: AppColors.onSurface,
            padding: EdgeInsets.zero,
          ),
          Expanded(
            child: Column(
              children: [
                Text(
                  'Host Dashboard',
                  style: GoogleFonts.ebGaramond(
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                    color: AppColors.onSurface,
                  ),
                ),
                Text(
                  'Good to share, Sun Devil.',
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 13,
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          Stack(
            children: [
              IconButton(
                onPressed: () {},
                icon: const Icon(Icons.notifications_outlined),
                color: AppColors.onSurface,
                padding: EdgeInsets.zero,
              ),
              Positioned(
                top: 6,
                right: 6,
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: AppColors.errorColor,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: const Color(0xFFFAF8F5),
                      width: 1.5,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildImpactCard(Map<String, int> impact) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.primaryGreen,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.primaryGreen.withOpacity(0.3),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Impact This Week',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
              Icon(Icons.eco, color: AppColors.statusGold.withOpacity(0.8), size: 28),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildImpactStat('${impact['mealsShared'] ?? 0}', 'Meals Shared'),
              Container(width: 1, height: 40, color: Colors.white.withOpacity(0.2)),
              _buildImpactStat('${impact['foodSavedLbs'] ?? 0}.3', 'lbs Food Saved'),
              Container(width: 1, height: 40, color: Colors.white.withOpacity(0.2)),
              _buildImpactStat('${impact['peopleFed'] ?? 0}', 'People Fed'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildImpactStat(String value, String label) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          value,
          style: GoogleFonts.hankenGrotesk(
            fontSize: 28,
            fontWeight: FontWeight.w600,
            color: Colors.white,
            height: 1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: GoogleFonts.hankenGrotesk(
            fontSize: 10,
            color: Colors.white.withOpacity(0.7),
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildTabs() {
    return DefaultTabController(
      length: 3,
      child: TabBar(
        labelColor: AppColors.onSurface,
        unselectedLabelColor: AppColors.onSurfaceVariant,
        indicatorColor: AppColors.primaryGreen,
        indicatorWeight: 2,
        labelStyle: GoogleFonts.hankenGrotesk(fontSize: 13, fontWeight: FontWeight.w600),
        unselectedLabelStyle: GoogleFonts.hankenGrotesk(fontSize: 13, fontWeight: FontWeight.w500),
        tabs: const [
          Tab(text: 'Active (3)'),
          Tab(text: 'Scheduled (1)'),
          Tab(text: 'Past'),
        ],
      ),
    );
  }

  Widget _buildPostList(BuildContext context, List<FoodPostEntity> posts) {
    if (posts.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            children: [
              Icon(Icons.restaurant_outlined, size: 48, color: AppColors.outlineVariant),
              const SizedBox(height: 12),
              Text(
                'No active posts yet.\nCreate your first food post!',
                style: GoogleFonts.hankenGrotesk(
                  color: AppColors.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      children: posts
          .asMap()
          .entries
          .map((e) => Padding(
                padding: EdgeInsets.only(bottom: e.key < posts.length - 1 ? 12 : 0),
                child: _buildPostCard(context, e.value)
                    .animate(delay: (e.key * 100).ms)
                    .fadeIn()
                    .slideX(begin: 0.1),
              ))
          .toList(),
    );
  }

  Widget _buildPostCard(BuildContext context, FoodPostEntity post) {
    return GestureDetector(
      onTap: () => context.push('/host/post-management', extra: post),
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: AppShadows.card,
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: SizedBox(
                width: 100,
                height: 100,
                child: post.imageUrls.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: post.imageUrls.first,
                        fit: BoxFit.cover,
                        errorWidget: (_, __, ___) => Container(
                          color: AppColors.surfaceContainerLow,
                          child: const Icon(Icons.restaurant),
                        ),
                      )
                    : Container(
                        color: AppColors.surfaceContainerLow,
                        child: const Icon(Icons.restaurant),
                      ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    post.title,
                    style: GoogleFonts.ebGaramond(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF0C3226),
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    post.locationName,
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 12,
                      color: const Color(0xFF0C3226),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.location_on_outlined, size: 12, color: AppColors.onSurfaceVariant),
                      const SizedBox(width: 2),
                      Text(
                        '${post.distanceMiles}mi away',
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 11,
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: AppColors.liveGreen,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Live',
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.successEmerald,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '${post.remainingQuantity}',
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 28,
                    fontWeight: FontWeight.w600,
                    color: AppColors.onSurface,
                    height: 1,
                  ),
                ),
                Text(
                  'left\nof ${post.totalQuantity} servings',
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 10,
                    color: AppColors.onSurfaceVariant,
                    height: 1.3,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
            const SizedBox(width: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildCreateButton(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: () => context.push('/host/create-post'),
      icon: const Icon(Icons.add, size: 18),
      label: Text(
        'Create New Post',
        style: GoogleFonts.hankenGrotesk(
          fontWeight: FontWeight.w500,
          fontSize: 15,
        ),
      ),
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 14),
        side: const BorderSide(color: AppColors.outlineVariant),
        foregroundColor: AppColors.onSurface,
        backgroundColor: const Color(0xFFF4F2EC),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(100),
        ),
      ),
    );
  }
}
