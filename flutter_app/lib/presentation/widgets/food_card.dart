import 'package:cached_network_image/cached_network_image.dart';
import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class FoodCard extends StatelessWidget {
  final FoodPostEntity post;
  final VoidCallback? onTap;
  final bool showBookmark;

  const FoodCard({
    super.key,
    required this.post,
    this.onTap,
    this.showBookmark = true,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppRadius.xxxl),
          boxShadow: AppShadows.card,
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeroImage(),
            _buildDetails(context),
          ],
        ),
      ),
    );
  }

  Widget _buildHeroImage() {
    return Stack(
      children: [
        SizedBox(
          height: 220,
          width: double.infinity,
          child: post.imageUrls.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: post.imageUrls.first,
                  fit: BoxFit.cover,
                  placeholder: (_, __) => Container(
                    color: AppColors.surfaceContainerHigh,
                    child: const Center(
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.primaryGreen,
                      ),
                    ),
                  ),
                  errorWidget: (_, __, ___) => Container(
                    color: AppColors.surfaceContainerLow,
                    child: const Icon(Icons.restaurant, color: AppColors.outlineColor),
                  ),
                )
              : Container(
                  color: AppColors.surfaceContainerLow,
                  child: const Icon(Icons.restaurant, size: 48, color: AppColors.outlineColor),
                ),
        ),
        // Gradient overlay
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withOpacity(0.2),
                  Colors.transparent,
                  Colors.black.withOpacity(0.6),
                ],
                stops: const [0.0, 0.4, 1.0],
              ),
            ),
          ),
        ),
        // Featured badge
        if (post.isFeatured)
          Positioned(
            top: 16,
            left: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.primaryGreen,
                borderRadius: BorderRadius.circular(100),
              ),
              child: Text(
                'FEATURED',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                  letterSpacing: 0.8,
                ),
              ),
            ),
          ),
        // Time badge
        Positioned(
          top: 16,
          right: 16,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.primaryGreen,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.3),
                  blurRadius: 6,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '${post.minutesLeft}',
                  style: GoogleFonts.ebGaramond(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                    height: 1,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'min left',
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 9,
                    color: Colors.white,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
        ),
        // Distance
        Positioned(
          bottom: 12,
          left: 16,
          child: Text(
            '${post.distanceMiles} mi',
            style: GoogleFonts.hankenGrotesk(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Colors.white,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDetails(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  post.title,
                  style: GoogleFonts.ebGaramond(
                    fontSize: 20,
                    fontWeight: FontWeight.w500,
                    color: AppColors.primaryGreen,
                    height: 1.2,
                  ),
                ),
              ),
              if (showBookmark)
                IconButton(
                  onPressed: () {},
                  icon: const Icon(Icons.bookmark_border),
                  color: AppColors.onSurfaceVariant,
                  iconSize: 22,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            post.locationName,
            style: GoogleFonts.hankenGrotesk(
              fontSize: 14,
              color: AppColors.onSurfaceVariant,
            ),
          ),
          if (post.dietaryTags.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: post.dietaryTags.take(3).map((tag) {
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: Text(
                    tag.displayName,
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 12,
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ],
      ),
    );
  }
}
