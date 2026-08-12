import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/core/constants/app_fonts.dart';
import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/presentation/providers/auth_provider.dart';
import 'package:ecoeats/presentation/providers/claims_provider.dart';
import 'package:ecoeats/presentation/providers/posts_provider.dart';
import 'package:ecoeats/presentation/widgets/app_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class ClaimScreen extends ConsumerWidget {
  const ClaimScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final postAsync = ref.watch(selectedPostProvider);
    final claimState = ref.watch(claimFoodNotifierProvider);

    return postAsync.when(
      data: (post) {
        if (post == null) {
          return const Scaffold(
            body: Center(child: Text('Post not found')),
          );
        }
        return _buildContent(context, ref, post, claimState);
      },
      loading: () => const Scaffold(
        backgroundColor: AppColors.backgroundCream,
        body: Center(
          child: CircularProgressIndicator(color: AppColors.primaryGreen),
        ),
      ),
      error: (e, _) => Scaffold(
        body: Center(child: Text('Error: $e')),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    WidgetRef ref,
    FoodPostEntity post,
    AsyncValue claimState,
  ) {
    return Scaffold(
      backgroundColor: const Color(0xFFFBF9F4),
      body: Stack(
        children: [
          SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildHeroSection(context, post),
                _buildFoodInfo(post)
                    .animate()
                    .fadeIn(delay: 150.ms)
                    .slideY(begin: 0.1),
              ],
            ),
          ),
          // Top navigation overlay
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.5),
                    Colors.transparent,
                  ],
                ),
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildCircleButton(
                        Icons.arrow_back_ios_new,
                        () => context.pop(),
                      ),
                      _buildCircleButton(Icons.share_outlined, () {}),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCircleButton(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.2),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
        ),
        child: Icon(icon, color: Colors.white, size: 18),
      ),
    );
  }

  Widget _buildHeroSection(BuildContext context, FoodPostEntity post) {
    return SizedBox(
      height: 240,
      child: Stack(
        fit: StackFit.expand,
        children: [
          post.imageUrls.isNotEmpty
              ? AppImage(
                  source: post.imageUrls.first,
                  fit: BoxFit.cover,
                )
              : Container(color: AppColors.primaryGreen),
          // Time badge
          Positioned(
            top: 72,
            right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.primaryGreen,
                borderRadius: BorderRadius.circular(12),
                boxShadow: AppShadows.button,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${post.minutesLeft}',
                    style: AppFonts.display(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      height: 1,
                    ),
                  ),
                  Text(
                    'min left',
                    style: AppFonts.body(
                      fontSize: 9,
                      color: Colors.white,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFoodInfo(FoodPostEntity post) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 120),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            post.title,
            style: AppFonts.display(
              fontSize: 28,
              fontWeight: FontWeight.w600,
              color: AppColors.primaryGreen,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            post.locationName,
            style: AppFonts.body(
              fontSize: 14,
              color: AppColors.onSurfaceVariant,
            ),
          ),
          Text(
            '${post.distanceMiles} mi away',
            style: AppFonts.body(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: AppColors.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            post.description,
            style: AppFonts.body(
              fontSize: 15,
              color: AppColors.onSurface,
              height: 1.6,
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: post.dietaryTags.map((tag) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(100),
                  border: Border.all(color: AppColors.surfaceDim),
                ),
                child: Text(
                  tag.displayName,
                  style: AppFonts.body(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: AppColors.onSurface,
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          Divider(color: AppColors.surfaceDim),
          const SizedBox(height: 16),
          _buildPickupDetails(post),
          const SizedBox(height: 20),
          Divider(color: AppColors.surfaceDim),
          const SizedBox(height: 16),
          _buildSharedBy(post),
          const SizedBox(height: 20),
          _buildClaimButton(),
          const SizedBox(height: 8),
          Center(
            child: Text(
              "You'll have 15 minutes to confirm pickup.",
              style: AppFonts.body(
                fontSize: 12,
                color: AppColors.onSurfaceVariant,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPickupDetails(FoodPostEntity post) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Pickup Details',
          style: AppFonts.display(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: AppColors.primaryGreen,
          ),
        ),
        const SizedBox(height: 16),
        _buildPickupRow(
          icon: Icons.location_on_outlined,
          label: 'Where',
          content: '${post.locationName}\n${post.locationAddress}',
        ),
        const SizedBox(height: 14),
        _buildPickupRow(
          icon: Icons.access_time,
          label: 'When',
          content: 'Today · 10:00 AM – 12:00 PM',
        ),
        if (post.locationNotes != null) ...[
          const SizedBox(height: 14),
          _buildPickupRow(
            icon: Icons.chat_bubble_outline,
            label: 'Notes',
            content: post.locationNotes!,
          ),
        ],
      ],
    );
  }

  Widget _buildPickupRow({
    required IconData icon,
    required String label,
    required String content,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: AppColors.onSurfaceVariant),
        const SizedBox(width: 10),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 48,
              child: Text(
                label,
                style: AppFonts.body(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primaryGreen,
                ),
              ),
            ),
            Flexible(
              child: SizedBox(
                width: 240,
                child: Text(
                  content,
                  style: AppFonts.body(
                    fontSize: 13,
                    color: AppColors.onSurface,
                    height: 1.5,
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSharedBy(FoodPostEntity post) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            Text(
              'Shared by',
              style: AppFonts.body(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.primaryGreen,
              ),
            ),
            const SizedBox(width: 10),
            CircleAvatar(
              radius: 18,
              backgroundImage: post.hostAvatarUrl != null
                  ? AppImage.providerFor(post.hostAvatarUrl)
                  : null,
              backgroundColor: AppColors.surfaceContainerHigh,
              child: post.hostAvatarUrl == null
                  ? Text(
                      post.hostName[0],
                      style: AppFonts.body(fontWeight: FontWeight.w600),
                    )
                  : null,
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  post.hostName,
                  style: AppFonts.body(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: AppColors.onSurface,
                  ),
                ),
                Text(
                  'ASU Student',
                  style: AppFonts.body(
                    fontSize: 11,
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ],
        ),
        Row(
          children: [
            const Icon(Icons.star, color: Colors.amber, size: 16),
            const SizedBox(width: 2),
            Text(
              '${post.hostRating} ',
              style: AppFonts.body(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.onSurface,
              ),
            ),
            Text(
              '(28)',
              style: AppFonts.body(
                fontSize: 12,
                color: AppColors.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildClaimButton() {
    return Consumer(
      builder: (context, ref, _) {
        final claimState = ref.watch(claimFoodNotifierProvider);
        final post = ref.watch(selectedPostProvider).valueOrNull;
        final user = ref.watch(currentUserProvider);

        return SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: claimState.isLoading
                ? null
                : () async {
                    if (post == null || user == null) return;
                    final claim = await ref
                        .read(claimFoodNotifierProvider.notifier)
                        .claim(postId: post.id, userId: user.id);
                    if (context.mounted && claim != null) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            '✅ Claimed! You have 15 minutes to pick up.',
                            style: AppFonts.body(),
                          ),
                          backgroundColor: AppColors.primaryGreen,
                          behavior: SnackBarBehavior.floating,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      );
                      context.go('/recipient/my-claims');
                    }
                  },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryGreen,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 18),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              elevation: 0,
            ),
            child: claimState.isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Text(
                    'Claim This Food',
                    style: AppFonts.body(
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
          ),
        );
      },
    );
  }
}
