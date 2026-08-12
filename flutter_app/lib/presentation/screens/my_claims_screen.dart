import 'dart:async';
import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/core/constants/app_fonts.dart';
import 'package:ecoeats/domain/entities/claim.dart';
import 'package:ecoeats/presentation/providers/claims_provider.dart';
import 'package:ecoeats/presentation/widgets/app_image.dart';
import 'package:ecoeats/presentation/widgets/bottom_nav_bar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class MyClaimsScreen extends ConsumerStatefulWidget {
  const MyClaimsScreen({super.key});

  @override
  ConsumerState<MyClaimsScreen> createState() => _MyClaimsScreenState();
}

class _MyClaimsScreenState extends ConsumerState<MyClaimsScreen> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // One clock that only asks for a repaint; every card works out its own
    // remaining time from its own pickup window. This was a single counter
    // seeded at 22:47 and shared by the whole screen — harmless while a bug
    // meant only one card ever rendered, and wrong the moment they all did,
    // because every claim would have counted down in lockstep.
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final claimsAsync = ref.watch(myClaimsProvider);
    final activeTab = ref.watch(claimsTabProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFFBF9F4),
      bottomNavigationBar: RecipientBottomNavBar(
        selectedItem: NavItem.myClaims,
        onItemSelected: (item) {
          if (item == NavItem.discover) context.go('/recipient/discover');
        },
      ),
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            _buildSegmentedControl(activeTab),
            Expanded(
              child: claimsAsync.when(
                data: (claims) => claims.isEmpty
                    ? _buildEmptyState()
                    : _buildClaimsList(claims),
                loading: () => const Center(
                  child: CircularProgressIndicator(color: AppColors.primaryGreen),
                ),
                error: (_, __) => const Center(child: Text('Failed to load claims')),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Column(
        children: [
          Text(
            'My Claims',
            style: AppFonts.display(
              fontSize: 28,
              fontWeight: FontWeight.w500,
              color: AppColors.onSurface,
            ),
          ).animate().fadeIn(),
          const SizedBox(height: 4),
          Text(
            'Your reserved food and pickup info.',
            style: AppFonts.body(
              fontSize: 13,
              color: AppColors.onSurfaceVariant,
            ),
          ).animate(delay: 100.ms).fadeIn(),
        ],
      ),
    );
  }

  Widget _buildSegmentedControl(ClaimsTab activeTab) {
    final tabs = [
      (ClaimsTab.active, 'Active'),
      (ClaimsTab.pickedUp, 'Picked Up'),
      (ClaimsTab.expired, 'Expired'),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(color: AppColors.surfaceDim),
        ),
        child: Row(
          children: tabs.map((tab) {
            final (tabValue, label) = tab;
            final isSelected = activeTab == tabValue;
            return Expanded(
              child: GestureDetector(
                onTap: () {
                  ref.read(claimsTabProvider.notifier).state = tabValue;
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: isSelected ? AppColors.primaryGreen : Colors.transparent,
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: Text(
                    label,
                    style: AppFonts.body(
                      fontSize: 13,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                      color: isSelected ? Colors.white : AppColors.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildClaimsList(List<ClaimEntity> claims) {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      // One row per claim, then a single how-to card at the end. This used to
      // render claims.first at index 0 and the how-to card at every other
      // index, so three claims showed as one claim followed by three copies of
      // the same instructions.
      itemCount: claims.length + 1,
      itemBuilder: (context, index) {
        if (index < claims.length) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _buildClaimCard(claims[index])
                .animate(delay: (index * 80).ms)
                .fadeIn()
                .slideY(begin: 0.1),
          );
        }
        return _buildHowToPickUpCard()
            .animate(delay: 100.ms)
            .fadeIn()
            .slideY(begin: 0.1);
      },
    );
  }

  Widget _buildClaimCard(ClaimEntity claim) {
    // Derived from this claim's own pickup window, so it is right after a
    // rebuild, a resume, or a device clock change — a decremented counter
    // drifts on all three.
    final remaining = claim.timeRemaining ?? Duration.zero;
    final minutes = remaining.inMinutes;
    final seconds = remaining.inSeconds % 60;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: AppColors.surfaceDim),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: SizedBox(
                  width: 120,
                  height: 150,
                  child: claim.postImageUrl != null
                      ? AppImage(
                          source: claim.postImageUrl,
                          fit: BoxFit.cover,
                        )
                      : Container(color: AppColors.surfaceContainerLow),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'RESERVED',
                        style: AppFonts.body(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primaryGreen,
                          letterSpacing: 0.8,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        claim.postTitle,
                        style: AppFonts.display(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: AppColors.onSurface,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        claim.locationName,
                        style: AppFonts.body(
                          fontSize: 11,
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        'Pickup window',
                        style: AppFonts.body(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.onSurface,
                        ),
                      ),
                      Text(
                        claim.pickupTimeDisplay.isNotEmpty
                            ? claim.pickupTimeDisplay
                            : '10:00 AM – 12:00 PM',
                        style: AppFonts.body(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: AppColors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          // Countdown Timer
          Column(
            children: [
              Text(
                'Time remaining',
                style: AppFonts.body(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: AppColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _buildCountdownUnit('$minutes', 'min'),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 20, left: 4, right: 4),
                    child: Text(
                      ':',
                      style: AppFonts.body(
                        fontSize: 32,
                        fontWeight: FontWeight.w500,
                        color: AppColors.onSurface,
                      ),
                    ),
                  ),
                  _buildCountdownUnit(seconds.toString().padLeft(2, '0'), 'sec'),
                ],
              ),
            ],
          ),
          const SizedBox(height: 20),
          // View Details button
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () {},
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                side: const BorderSide(color: AppColors.surfaceDim),
                foregroundColor: AppColors.onSurface,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: Text(
                'View Details',
                style: AppFonts.body(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCountdownUnit(String value, String label) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          value,
          style: AppFonts.body(
            fontSize: 40,
            fontWeight: FontWeight.w500,
            color: AppColors.onSurface,
            height: 1,
            letterSpacing: -1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label.toUpperCase(),
          style: AppFonts.body(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            color: AppColors.onSurfaceVariant,
            letterSpacing: 1.5,
          ),
        ),
      ],
    );
  }

  Widget _buildHowToPickUpCard() {
    final steps = [
      (Icons.check_circle_outline, 'Go to Hassayampa Building, 2nd Floor Lounge\n(699 S Mill Ave, Tempe, AZ 85281)'),
      (Icons.check_circle_outline, 'Check in with the host when you arrive.'),
      (Icons.shopping_bag_outlined, 'Bring your own bag or container.'),
      (Icons.check_circle_outline, 'Be kind and help reduce food waste!'),
    ];

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: AppColors.surfaceDim),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'How to Pick Up',
            style: AppFonts.body(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 16),
          ...steps.map((step) {
            final (icon, text) = step;
            return Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, size: 18, color: AppColors.onSurfaceVariant),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      text,
                      style: AppFonts.body(
                        fontSize: 13,
                        color: AppColors.onSurfaceVariant,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.shopping_bag_outlined,
              size: 56,
              color: AppColors.outlineVariant,
            ),
            const SizedBox(height: 16),
            Text(
              'No claims yet',
              style: AppFonts.display(
                fontSize: 22,
                color: AppColors.onSurface,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Find food near you and claim it!',
              style: AppFonts.body(
                fontSize: 14,
                color: AppColors.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => context.go('/recipient/discover'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryGreen,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(100),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
              child: Text(
                'Discover Food',
                style: AppFonts.body(fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
