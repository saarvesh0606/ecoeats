import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/presentation/providers/auth_provider.dart';
import 'package:ecoeats/presentation/providers/posts_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

class ReviewPublishScreen extends ConsumerStatefulWidget {
  const ReviewPublishScreen({super.key});

  @override
  ConsumerState<ReviewPublishScreen> createState() => _ReviewPublishScreenState();
}

class _ReviewPublishScreenState extends ConsumerState<ReviewPublishScreen> {
  int _expirySelection = 0; // 0=today, 1=tomorrow, 2=within2days

  final List<String> _previewImages = [
    'https://lh3.googleusercontent.com/aida-public/AB6AXuB9zimbwYwKxjh4EAu5JDKxDYMoZaz5L5NFQgPgdhnNq6ZtK2_l0j_gS4PepF7YPdXCaHckGN8R_Jif8vcZH3Nnt97oKqG_wem0uWeXtr6yjsJxkj-txau6xrOqKE4aaiM6GuJSxL1DyKSh7_ThoIyVdt3NbahftnOj10BUd-bflMg63cJuhEZb7IrHXm71q6qnfoSeyBgNnTyPCAG1pMW2-TFYN0JWu9MRkgAXVZqVMSc2u0iLUkk1ig',
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDyL2iYZKVEMfOE1xJXinCmaOXi9eJlBiK68_AEAHPk4R0_0n_DScxbrC130b4B_rbO0zHuSV78fYLQX4LQDmejQ2SJIoi-RrzJFebfl15ojQT1Ia9UMBmS56soOItMS5tmzoiXpFOPTrItwzEYe6uBm69_cl_0guUs1z-MdoN5Ul_rzGZfOKWzON_9nNZZMnpyf1w3EGgT4ZtQ9enLL9C7SSqs4di3jSCIhHW5plCpfiRGUybt9zTEDw',
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBdhEnjE8SOtqePb3nlyUjTAyEWFSnrvlMeekoLgr19dz4o9R_EuM1g_FHQDxK-HbeazUUggIVC6i81tE6DhDFFpY8yzQc5JM1PHy9DCDLAn8Ju23WGDmJrY_QM1ajSiWf9yYPouM3nfQHe1lxfwCTNb387nzEUu_f7y_Dk0JE74PLW05j-jW2GfJ0_2vlaH3_nNLtjOazjJT8j8tJxgQfokaThuSQ6Mo5zA6hVIQu2XYMKT8HmpN-mog',
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
                  _buildListRows()
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
            style: GoogleFonts.ebGaramond(
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
          style: GoogleFonts.hankenGrotesk(
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
                      child: Image.network(
                        url,
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
          style: GoogleFonts.hankenGrotesk(
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
            border: Border.all(color: AppColors.outlineVariant.withOpacity(0.5)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildDetailRow(
                'Title',
                draft.title.isNotEmpty ? draft.title : 'Mediterranean Grain Bowl',
              ),
              Divider(color: AppColors.outlineVariant.withOpacity(0.4), height: 24),
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
          style: GoogleFonts.hankenGrotesk(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: AppColors.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: GoogleFonts.hankenGrotesk(
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

  Widget _buildListRows() {
    final rows = [
      ('Quantity', '45 servings'),
      ('Dietary / Allergies', 'Vegetarian · Gluten-Free'),
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
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.onSurface,
                        ),
                      ),
                    ),
                    Text(
                      value,
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 14,
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Icon(Icons.chevron_right, size: 16, color: AppColors.outlineVariant),
                  ],
                ),
              ),
              Divider(color: AppColors.outlineVariant.withOpacity(0.4), height: 1),
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
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Memorial Union - MU Market\n301 E Orange Mall, Tempe, AZ 85281',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 14,
                        color: AppColors.onSurface,
                        height: 1.4,
                      ),
                    ),
                    Text(
                      'Inside Market Pickup Shelf',
                      style: GoogleFonts.hankenGrotesk(
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
    final options = ['Today', 'Tomorrow', 'Within 2 Days'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Best By / Expires',
          style: GoogleFonts.hankenGrotesk(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          children: options.asMap().entries.map((e) {
            final isSelected = _expirySelection == e.key;
            return GestureDetector(
              onTap: () => setState(() => _expirySelection = e.key),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected ? AppColors.primaryGreen : Colors.white,
                  borderRadius: BorderRadius.circular(100),
                  border: Border.all(
                    color: isSelected ? AppColors.primaryGreen : AppColors.outlineVariant,
                  ),
                ),
                child: Text(
                  e.value,
                  style: GoogleFonts.hankenGrotesk(
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
          'Expires today at 6:00 PM',
          style: GoogleFonts.hankenGrotesk(
            fontSize: 12,
            color: AppColors.onSurfaceVariant,
          ),
        ),
      ],
    );
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
              const Color(0xFFFDFCF9).withOpacity(0),
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
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 17,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0.5,
                  ),
                ),
        ),
      ),
    );
  }

  Future<void> _onPublish(BuildContext context) async {
    final user = ref.read(currentUserProvider);
    final draft = ref.read(postDraftProvider);
    final notifier = ref.read(createPostNotifierProvider.notifier);

    await notifier.publishPost(
      hostId: user?.id ?? 'host_demo',
      hostName: user?.displayName ?? 'Host',
      draft: draft,
    );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '🎉 Post published successfully!',
          style: GoogleFonts.hankenGrotesk(),
        ),
        backgroundColor: AppColors.primaryGreen,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
    context.go('/host/dashboard');
  }
}
