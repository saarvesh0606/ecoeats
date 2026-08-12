import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/core/constants/app_fonts.dart';
import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/presentation/providers/auth_provider.dart';
import 'package:ecoeats/presentation/providers/posts_provider.dart';
import 'package:ecoeats/presentation/widgets/app_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class ReviewPublishScreen extends ConsumerStatefulWidget {
  const ReviewPublishScreen({super.key});

  @override
  ConsumerState<ReviewPublishScreen> createState() => _ReviewPublishScreenState();
}

class _ReviewPublishScreenState extends ConsumerState<ReviewPublishScreen> {
  /// One of [kExpiryWindowMinutes]. Defaults to the longest, which is what a
  /// host most often wants and is still only an hour.
  int _expiryMinutes = kExpiryWindowMinutes.last;

  final List<String> _previewImages = [
    'assets/images/food_grain_bowl.jpg',
    'assets/images/food_pasta.jpg',
    'assets/images/food_pastries.jpg',
  ];

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(postDraftProvider);
    final createState = ref.watch(createPostNotifierProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFFDFCF9),
      body: Stack(
        children: [
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 120),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildHeader(context),
                  const SizedBox(height: 24),
                  _buildPhotosSection()
                      .animate()
                      .fadeIn()
                      .slideY(begin: 0.1),
                  const SizedBox(height: 24),
                  _buildPostDetailsSection(draft)
                      .animate(delay: 100.ms)
                      .fadeIn()
                      .slideY(begin: 0.1),
                  const SizedBox(height: 24),
                  _buildListRows(draft)
                      .animate(delay: 200.ms)
                      .fadeIn(),
                  const SizedBox(height: 24),
                  _buildExpirySection()
                      .animate(delay: 300.ms)
                      .fadeIn(),
                ],
              ),
            ),
          ),
          _buildBottomAction(context, createState),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Row(
      children: [
        IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          color: AppColors.onSurface,
          padding: EdgeInsets.zero,
        ),
        Expanded(
          child: Text(
            'Review & Publish',
            style: AppFonts.display(
              fontSize: 22,
              fontWeight: FontWeight.w500,
              color: AppColors.onSurface,
            ),
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(width: 44),
      ],
    );
  }

  Widget _buildPhotosSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Photos',
          style: AppFonts.body(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 84,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              ..._previewImages.map((url) => Padding(
                    padding: const EdgeInsets.only(right: 10),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: AppImage(
                        source: url,
                        width: 80,
                        height: 80,
                        fit: BoxFit.cover,
                      ),
                    ),
                  )),
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: const Color(0xFFFAF9F6),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppColors.outlineVariant,
                    style: BorderStyle.solid,
                  ),
                ),
                child: const Icon(Icons.add, color: AppColors.outlineVariant, size: 32),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildPostDetailsSection(PostDraft draft) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Post Details',
          style: AppFonts.body(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.5)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildDetailRow(
                'Title',
                draft.title.isNotEmpty ? draft.title : 'Mediterranean Grain Bowl',
              ),
              Divider(color: AppColors.outlineVariant.withValues(alpha: 0.4), height: 24),
              _buildDetailRow(
                'Description',
                draft.description.isNotEmpty
                    ? draft.description
                    : 'Fresh Mediterranean grain bowls with roasted veggies, chickpeas, and feta.',
                isMultiLine: true,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildDetailRow(String label, String value, {bool isMultiLine = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppFonts.body(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: AppColors.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: AppFonts.body(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: AppColors.onSurface,
            height: 1.4,
          ),
          maxLines: isMultiLine ? null : 1,
        ),
      ],
    );
  }

  Widget _buildListRows(PostDraft draft) {
    // Read from the draft that is about to be published. These were fixed
    // strings — the screen showed "45 servings" and then published a draft
    // whose quantity was whatever the form had actually collected, so the
    // confirmation step confirmed something that was never posted.
    final rows = [
      (
        'Quantity',
        '${draft.quantity} serving${draft.quantity == 1 ? '' : 's'}',
      ),
      (
        'Dietary / Allergies',
        draft.dietaryTags.isEmpty
            ? 'None specified'
            : draft.dietaryTags.map((t) => t.displayName).join(' · '),
      ),
    ];

    return Column(
      children: [
        ...rows.map((row) {
          final (label, value) = row;
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 14),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        style: AppFonts.body(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.onSurface,
                        ),
                      ),
                    ),
                    Text(
                      value,
                      style: AppFonts.body(
                        fontSize: 14,
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Icon(Icons.chevron_right, size: 16, color: AppColors.outlineVariant),
                  ],
                ),
              ),
              Divider(color: AppColors.outlineVariant.withValues(alpha: 0.4), height: 1),
            ],
          );
        }),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Pickup Location (exact)',
                      style: AppFonts.body(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Memorial Union - MU Market\n301 E Orange Mall, Tempe, AZ 85281',
                      style: AppFonts.body(
                        fontSize: 14,
                        color: AppColors.onSurface,
                        height: 1.4,
                      ),
                    ),
                    Text(
                      'Inside Market Pickup Shelf',
                      style: AppFonts.body(
                        fontSize: 12,
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, size: 16, color: AppColors.outlineVariant),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildExpirySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          // "Best By" suggested a date. This is a collection window measured in
          // minutes, so it now says what it is.
          'Pick up within',
          style: AppFonts.body(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: kExpiryWindowMinutes.map((minutes) {
            final isSelected = _expiryMinutes == minutes;
            return GestureDetector(
              onTap: () => setState(() => _expiryMinutes = minutes),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected ? AppColors.primaryGreen : Colors.white,
                  borderRadius: BorderRadius.circular(100),
                  border: Border.all(
                    color: isSelected
                        ? AppColors.primaryGreen
                        : AppColors.outlineVariant,
                  ),
                ),
                child: Text(
                  expiryWindowLabel(minutes),
                  style: AppFonts.body(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: isSelected ? Colors.white : AppColors.onSurface,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 8),
        Text(
          // Computed from the actual choice. This line used to read "Expires
          // today at 6:00 PM" no matter what was selected, or when.
          'Expires at ${_formatClockTime(_expiresAt())}',
          style: AppFonts.body(
            fontSize: 12,
            color: AppColors.onSurfaceVariant,
          ),
        ),
      ],
    );
  }

  String _formatClockTime(DateTime time) {
    final hour = time.hour % 12 == 0 ? 12 : time.hour % 12;
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute ${time.hour >= 12 ? 'PM' : 'AM'}';
  }

  Widget _buildBottomAction(BuildContext context, AsyncValue createState) {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 32, 20, 32),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.bottomCenter,
            end: Alignment.topCenter,
            colors: [
              const Color(0xFFFDFCF9),
              const Color(0xFFFDFCF9).withValues(alpha: 0),
            ],
          ),
        ),
        child: ElevatedButton(
          onPressed: createState.isLoading ? null : () => _onPublish(context),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primaryGreen,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            elevation: 0,
          ),
          child: createState.isLoading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : Text(
                  'Publish Post',
                  style: AppFonts.body(
                    fontSize: 17,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0.5,
                  ),
                ),
        ),
      ),
    );
  }

  /// When the selected window runs out.
  DateTime _expiresAt() =>
      DateTime.now().add(Duration(minutes: _expiryMinutes));

  Future<void> _onPublish(BuildContext context) async {
    final user = ref.read(currentUserProvider);
    final notifier = ref.read(createPostNotifierProvider.notifier);
    final messenger = ScaffoldMessenger.of(context);

    final draft = ref
        .read(postDraftProvider)
        .copyWith(expiresAt: _expiresAt());

    final post = await notifier.publishPost(
      hostId: user?.id ?? 'host_demo',
      hostName: user?.displayName ?? 'Host',
      draft: draft,
    );

    if (!mounted) return;

    // A failed publish used to still announce success and navigate away, so
    // the post silently never existed.
    if (post == null) {
      messenger.showSnackBar(
        SnackBar(
          content: Text("Couldn't publish that post.", style: AppFonts.body()),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      );
      return;
    }

    messenger.showSnackBar(
      SnackBar(
        content: Text(
          '🎉 Post published successfully!',
          style: AppFonts.body(),
        ),
        backgroundColor: AppColors.primaryGreen,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
    context.go('/host/dashboard');
  }
}
