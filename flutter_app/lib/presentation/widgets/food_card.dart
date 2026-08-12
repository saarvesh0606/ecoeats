import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/core/constants/app_fonts.dart';
import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/presentation/widgets/app_image.dart';
import 'package:flutter/material.dart';

/// A single piece of food on the feed.
///
/// The photo carries the card, so everything on top of it — the countdown, the
/// distance, the featured flag — sits over a gradient rather than in its own
/// strip, and the distance takes a text shadow because it lands on whatever
/// the photo happens to be.
class FoodCard extends StatefulWidget {
  final FoodPostEntity post;
  final VoidCallback? onTap;

  /// Hidden entirely when false. A bookmark that cannot be pressed is worse
  /// than no bookmark, so this is not rendered disabled.
  final bool showBookmark;

  const FoodCard({
    super.key,
    required this.post,
    this.onTap,
    this.showBookmark = true,
  });

  @override
  State<FoodCard> createState() => _FoodCardState();
}

class _FoodCardState extends State<FoodCard> {
  // Local only. There is no save/bookmark repository yet, so this responds to
  // the touch but does not outlive the screen — persistence arrives with the
  // real API, where the endpoints already exist.
  bool _saved = false;

  FoodPostEntity get post => widget.post;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppRadius.xxl),
          boxShadow: AppShadows.card,
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeroImage(),
            _buildDetails(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeroImage() {
    return SizedBox(
      height: 220,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          AppImage(
            source: post.imageUrls.isNotEmpty ? post.imageUrls.first : null,
            fit: BoxFit.cover,
            fallbackIconSize: 48,
          ),
          // Darkens both ends so white text reads at the top and bottom
          // without dulling the middle of the photo.
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.20),
                  Colors.transparent,
                  Colors.black.withValues(alpha: 0.60),
                ],
                stops: const [0.0, 0.4, 1.0],
              ),
            ),
          ),
          if (post.isFeatured)
            Positioned(top: 14, left: 14, child: _featuredBadge()),
          Positioned(top: 14, right: 14, child: _countdownPill()),
          Positioned(bottom: 14, left: 14, child: _distanceLabel()),
        ],
      ),
    );
  }

  Widget _featuredBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.primaryGreen,
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Text(
        'FEATURED',
        style: AppFonts.body(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: Colors.white,
          letterSpacing: 0.8,
        ),
      ),
    );
  }

  Widget _countdownPill() {
    // Past an hour the minute count stops being useful and starts being noise
    // ("128 min left"), so it rolls over to hours.
    final minutes = post.minutesLeft;
    final showHours = minutes >= 60;
    final value = showHours ? '${minutes ~/ 60}' : '$minutes';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.primaryGreen,
        borderRadius: BorderRadius.circular(AppRadius.md),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.20),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          RichText(
            text: TextSpan(
              style: AppFonts.body(
                fontSize: 22,
                fontWeight: FontWeight.w600,
                color: Colors.white,
                height: 1,
              ),
              children: [
                TextSpan(text: value),
                if (showHours)
                  TextSpan(
                    text: 'hr',
                    style: AppFonts.body(
                      fontSize: 14,
                      fontWeight: FontWeight.w400,
                      color: Colors.white,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 2),
          Text(
            showHours ? 'left' : 'min left',
            style: AppFonts.body(
              fontSize: 10,
              color: Colors.white,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }

  Widget _distanceLabel() {
    return Text(
      '${post.distanceMiles.toStringAsFixed(1)} mi',
      style: AppFonts.body(
        fontSize: 15,
        fontWeight: FontWeight.w500,
        color: Colors.white,
        // The label sits on the photo itself, which could be any colour.
        shadows: [
          Shadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 6),
        ],
      ),
    );
  }

  Widget _buildDetails() {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  post.title,
                  style: AppFonts.display(
                    fontSize: 22,
                    fontWeight: FontWeight.w500,
                    color: AppColors.primaryGreen,
                    height: 1.2,
                  ),
                ),
              ),
              if (widget.showBookmark)
                GestureDetector(
                  onTap: () => setState(() => _saved = !_saved),
                  child: Padding(
                    padding: const EdgeInsets.only(left: 8, top: 2),
                    child: Icon(
                      _saved
                          ? Icons.bookmark_rounded
                          : Icons.bookmark_border_rounded,
                      size: 24,
                      color: _saved
                          ? AppColors.primaryGreen
                          : AppColors.onSurfaceVariant,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            post.locationName,
            style: AppFonts.body(
              fontSize: 15,
              color: AppColors.onSurfaceVariant,
            ),
          ),
          if (post.dietaryTags.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: post.dietaryTags
                  .take(3)
                  .map((tag) => _DietaryChip(label: tag.displayName))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}

class _DietaryChip extends StatelessWidget {
  const _DietaryChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Text(
        label,
        style: AppFonts.body(fontSize: 13, color: AppColors.onSurfaceVariant),
      ),
    );
  }
}
