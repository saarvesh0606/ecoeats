import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/core/constants/app_fonts.dart';
import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/domain/usecases/manage_post_usecase.dart';
import 'package:ecoeats/presentation/providers/posts_provider.dart';
import 'package:ecoeats/presentation/widgets/app_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class PostManagementScreen extends ConsumerWidget {
  final FoodPostEntity post;

  const PostManagementScreen({super.key, required this.post});

  /// Runs a management action, refreshes what it affected, and leaves.
  ///
  /// Every one of these buttons was `onPressed: () {}` while the use cases
  /// behind them were already written and tested — the screen simply never
  /// called them.
  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    Future<void> Function(ManagePostUseCase useCase) action,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action(ref.read(managePostUseCaseProvider));
      // The dashboard and the recipient feed are both stale now.
      ref.invalidate(hostPostsProvider);
      ref.invalidate(discoverPostsProvider);
      ref.invalidate(hostImpactProvider);
      if (context.mounted) Navigator.of(context).pop();
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text("Couldn't update the post: $e")),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F7F4),
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildHeader(context),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 16),
                    _buildHeroCard()
                        .animate()
                        .fadeIn()
                        .slideY(begin: 0.1),
                    const SizedBox(height: 20),
                    _buildQuantityCard()
                        .animate(delay: 100.ms)
                        .fadeIn()
                        .slideY(begin: 0.1),
                    const SizedBox(height: 20),
                    _buildLiveActivitySection()
                        .animate(delay: 200.ms)
                        .fadeIn(),
                    const SizedBox(height: 24),
                    _buildActionsSection(context, ref)
                        .animate(delay: 300.ms)
                        .fadeIn(),
                    const SizedBox(height: 40),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.arrow_back_ios_new, size: 20),
            color: AppColors.onSurface,
          ),
          Expanded(
            child: Text(
              'Post Management',
              style: AppFonts.display(
                fontSize: 20,
                fontWeight: FontWeight.w500,
                color: AppColors.onSurface,
              ),
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(width: 44),
        ],
      ),
    );
  }

  Widget _buildHeroCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryGreen,
        borderRadius: BorderRadius.circular(24),
        boxShadow: AppShadows.card,
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: SizedBox(
              width: 80,
              height: 80,
              child: post.imageUrls.isNotEmpty
                  ? AppImage(
                      source: post.imageUrls.first,
                      fit: BoxFit.cover,
                    )
                  : Container(color: AppColors.primaryGreen.withValues(alpha: 0.3)),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  post.title,
                  style: AppFonts.display(
                    fontSize: 18,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  post.locationName,
                  style: AppFonts.body(
                    fontSize: 13,
                    color: Colors.white.withValues(alpha: 0.8),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: AppColors.liveGreen,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.liveGreen,
                            blurRadius: 4,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'Live',
                      style: AppFonts.body(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuantityCard() {
    final progress = post.totalQuantity > 0
        ? post.remainingQuantity / post.totalQuantity
        : 0.0;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: AppShadows.card,
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Quantity Left',
                style: AppFonts.display(
                  fontSize: 18,
                  fontWeight: FontWeight.w500,
                  color: AppColors.onSurface,
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.outlineVariant),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${post.remainingQuantity}',
                    style: AppFonts.body(
                      fontSize: 52,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primaryGreen,
                      height: 1,
                    ),
                  ),
                  Text(
                    'of ${post.totalQuantity} servings',
                    style: AppFonts.body(
                      fontSize: 13,
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.group_outlined, size: 24, color: AppColors.primaryGreen),
                      const SizedBox(width: 6),
                      Text(
                        '27',
                        style: AppFonts.body(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primaryGreen,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    'People interested',
                    style: AppFonts.body(
                      fontSize: 12,
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: AppColors.surfaceContainerHigh,
              valueColor: const AlwaysStoppedAnimation<Color>(AppColors.primaryGreen),
              minHeight: 12,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLiveActivitySection() {
    final activities = [
      ('Maya P.', 'Claimed 1 serving', '2 min ago',
          'assets/images/food_grain_bowl.jpg'),
      ('Chris L.', 'Claimed 2 servings', '5 min ago',
          'assets/images/food_pasta.jpg'),
      ('Taylor K.', 'Claimed 1 serving', '8 min ago',
          'assets/images/food_pastries.jpg'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Live Activity',
          style: AppFonts.display(
            fontSize: 18,
            fontWeight: FontWeight.w500,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 16),
        ...activities.map((activity) {
          final (name, action, time, avatar) = activity;
          return Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundImage: AppImage.providerFor(avatar),
                  backgroundColor: AppColors.surfaceContainerHigh,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: AppFonts.body(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.onSurface,
                        ),
                      ),
                      Text(
                        action,
                        style: AppFonts.body(
                          fontSize: 12,
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  time,
                  style: AppFonts.body(
                    fontSize: 11,
                    color: AppColors.outlineColor,
                  ),
                ),
              ],
            ),
          );
        }),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Divider(color: AppColors.outlineVariant.withValues(alpha: 0.6)),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '+3 more claims',
              style: AppFonts.body(
                fontSize: 13,
                color: AppColors.onSurfaceVariant,
              ),
            ),
            TextButton(
              onPressed: () {},
              child: Text(
                'View all',
                style: AppFonts.body(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primaryGreen,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildActionsSection(BuildContext context, WidgetRef ref) {
    final isOutOfStock = post.status == PostStatus.outOfStock;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Actions',
          style: AppFonts.display(
            fontSize: 18,
            fontWeight: FontWeight.w500,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 12),
        // The design carried "Mark as Claimed" and "Out of Stock" as separate
        // buttons, but in this data model they are one operation — both end
        // availability. Rather than ship two controls that do the same thing,
        // the second one became the way back, which nothing offered before.
        ElevatedButton(
          onPressed: isOutOfStock
              ? null
              : () => _run(context, ref,
                  (useCase) => useCase.markOutOfStock(post.id)),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primaryGreen,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(100),
            ),
          ),
          child: Text(
            isOutOfStock ? 'All Claimed' : 'Mark as Claimed',
            style: AppFonts.body(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        if (isOutOfStock) ...[
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: () => _run(
              context,
              ref,
              (useCase) => useCase.restock(post.id, post.totalQuantity),
            ),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              side:
                  const BorderSide(color: AppColors.outlineVariant, width: 1.5),
              foregroundColor: AppColors.onSurface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(100),
              ),
            ),
            child: Text(
              'Back in Stock',
              style: AppFonts.body(
                fontSize: 15,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
        const SizedBox(height: 10),
        OutlinedButton(
          onPressed: () => _showEndEarlyDialog(context, ref),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 16),
            side: const BorderSide(color: Color(0xFF8B1A1A), width: 1.5),
            foregroundColor: const Color(0xFF8B1A1A),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(100),
            ),
          ),
          child: Text(
            'End Post Early',
            style: AppFonts.body(
              fontSize: 15,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }

  void _showEndEarlyDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(
          'End Post Early?',
          style: AppFonts.display(fontWeight: FontWeight.w600),
        ),
        content: Text(
          'This will close the post and no more claims will be allowed.',
          style: AppFonts.body(fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              // Close the dialog first, then act on the screen underneath it.
              Navigator.pop(context);
              _run(context, ref, (useCase) => useCase.endPostEarly(post.id));
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF8B1A1A),
            ),
            child: const Text('End Post'),
          ),
        ],
      ),
    );
  }
}
