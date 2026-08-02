import 'package:cached_network_image/cached_network_image.dart';
import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';

class PostManagementScreen extends StatelessWidget {
  final FoodPostEntity post;

  const PostManagementScreen({super.key, required this.post});

  @override
  Widget build(BuildContext context) {
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
                    _buildActionsSection(context)
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
              style: GoogleFonts.ebGaramond(
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
                  ? CachedNetworkImage(
                      imageUrl: post.imageUrls.first,
                      fit: BoxFit.cover,
                    )
                  : Container(color: AppColors.primaryGreen.withOpacity(0.3)),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  post.title,
                  style: GoogleFonts.ebGaramond(
                    fontSize: 18,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  post.locationName,
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 13,
                    color: Colors.white.withOpacity(0.8),
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
                      style: GoogleFonts.hankenGrotesk(
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
                style: GoogleFonts.ebGaramond(
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
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 48,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primaryGreen,
                      height: 1,
                    ),
                  ),
                  Text(
                    'of ${post.totalQuantity} servings',
                    style: GoogleFonts.hankenGrotesk(
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
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primaryGreen,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    'People interested',
                    style: GoogleFonts.hankenGrotesk(
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
          'https://lh3.googleusercontent.com/aida-public/AB6AXuA8GozMq27jKpvanslFGgEZVOka1B0YU4f0rVsG6URx7-rmEq6VXUicc7BezdDWjGkZIl9Y-MKs1vCGrtaBytwf9NrWLOnBtYj_7F7e6uFLWFOnCpF-ag_LOlI4NraI2EzQxg4xcLsTZYXhqKeTbZA6FWFdWPMZnUmWXPtWfTfQlv7zXaAzncg7sAxCt-U2vNhIRqfkbI1zBp-g8sBPY9hEvCVh--T7XNbrGvVNI9MSI9HLGlhgH9ulPw'),
      ('Chris L.', 'Claimed 2 servings', '5 min ago',
          'https://lh3.googleusercontent.com/aida-public/AB6AXuBwM1sUzwbewUYKWjagpwFtANQ-ivUXvL-Ja1CXTEFxgVoMvyAvzlWc8cUC5fWNsnFuJkZKhDG3qlt3E51TlxfI7xE5TV1CWxcZZCF4bU60pa5aVasnLHwfhZF-atinqz5Nc_Ig058APPBKvNWODcGD9mU0DWVo4BK3zTmlMfvi_M9uPuNJ9T8pCtO9AGjD8BAqP1PY5Hr_o9ZFCY7vuQbBpZPfe5VmlPkZRCBoLqFNXD76XWWxw15nFQ'),
      ('Taylor K.', 'Claimed 1 serving', '8 min ago',
          'https://lh3.googleusercontent.com/aida-public/AB6AXuDxDwgJGcTrEl58E2TxsRyaXXjqzT5-TePfO5htytOO5P2-Njbc2hFkc2lpeYgPgdiXNMyzpV9L5mEeYxM15HruBW8zB73-QEaPPMB37RU8hW25HNkS1ZTpgegfJehC59ZYoNvPLfL4AJz-XTfDs-74yiqAQnZhusFE4rbpmxDNPkR98RCbBgQZtl29zlWtwN_HMVCGRr699faQ_4MlM0RcRAX7bwHtg2onEHHny7pJrOIyszY4yeoMaw'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Live Activity',
          style: GoogleFonts.ebGaramond(
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
                  backgroundImage: NetworkImage(avatar),
                  onBackgroundImageError: (_, __) {},
                  backgroundColor: AppColors.surfaceContainerHigh,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.onSurface,
                        ),
                      ),
                      Text(
                        action,
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 12,
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  time,
                  style: GoogleFonts.hankenGrotesk(
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
          child: Divider(color: AppColors.outlineVariant.withOpacity(0.6)),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '+3 more claims',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 13,
                color: AppColors.onSurfaceVariant,
              ),
            ),
            TextButton(
              onPressed: () {},
              child: Text(
                'View all',
                style: GoogleFonts.hankenGrotesk(
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

  Widget _buildActionsSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Actions',
          style: GoogleFonts.ebGaramond(
            fontSize: 18,
            fontWeight: FontWeight.w500,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 12),
        ElevatedButton(
          onPressed: () {},
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primaryGreen,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(100),
            ),
          ),
          child: Text(
            'Mark as Claimed',
            style: GoogleFonts.hankenGrotesk(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(height: 10),
        OutlinedButton(
          onPressed: () {},
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 16),
            side: const BorderSide(color: AppColors.outlineVariant, width: 1.5),
            foregroundColor: AppColors.onSurface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(100),
            ),
          ),
          child: Text(
            'Out of Stock',
            style: GoogleFonts.hankenGrotesk(
              fontSize: 15,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        const SizedBox(height: 10),
        OutlinedButton(
          onPressed: () => _showEndEarlyDialog(context),
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
            style: GoogleFonts.hankenGrotesk(
              fontSize: 15,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }

  void _showEndEarlyDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(
          'End Post Early?',
          style: GoogleFonts.ebGaramond(fontWeight: FontWeight.w600),
        ),
        content: Text(
          'This will close the post and no more claims will be allowed.',
          style: GoogleFonts.hankenGrotesk(fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context),
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
