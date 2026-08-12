import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/core/constants/app_fonts.dart';
import 'package:ecoeats/domain/entities/user.dart';
import 'package:ecoeats/presentation/providers/auth_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class RecipientLoginScreen extends ConsumerStatefulWidget {
  const RecipientLoginScreen({super.key});

  @override
  ConsumerState<RecipientLoginScreen> createState() => _RecipientLoginScreenState();
}

class _RecipientLoginScreenState extends ConsumerState<RecipientLoginScreen> {
  final _emailController = TextEditingController(text: 'sun.devils@asu.edu');
  UserRole _selectedRole = UserRole.recipient;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _onContinue() async {
    await ref.read(authNotifierProvider.notifier).signIn(
          email: _emailController.text.trim(),
          role: _selectedRole,
        );
    if (!mounted) return;
    ref.read(authNotifierProvider).whenOrNull(
      data: (user) {
        if (user != null) {
          if (user.isHost) {
            context.go('/host/dashboard');
          } else {
            context.go('/recipient/discover');
          }
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = ref.watch(authNotifierProvider).isLoading;

    return Scaffold(
      backgroundColor: AppColors.backgroundCream,
      bottomNavigationBar: _buildBottomNav(),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            children: [
              const SizedBox(height: 32),
              _buildLogo().animate().fadeIn(duration: 600.ms),
              const SizedBox(height: 24),
              _buildDivider(),
              const SizedBox(height: 24),
              _buildCommunitySection()
                  .animate()
                  .fadeIn(delay: 200.ms)
                  .slideY(begin: 0.1),
              const SizedBox(height: 24),
              _buildEmailField()
                  .animate()
                  .fadeIn(delay: 300.ms)
                  .slideY(begin: 0.1),
              const SizedBox(height: 24),
              _buildDivider(),
              const SizedBox(height: 24),
              _buildRoleSelection()
                  .animate()
                  .fadeIn(delay: 400.ms)
                  .slideY(begin: 0.1),
              const SizedBox(height: 20),
              _buildFooterText()
                  .animate()
                  .fadeIn(delay: 500.ms),
              const SizedBox(height: 20),
              _buildContinueButton(isLoading)
                  .animate()
                  .fadeIn(delay: 600.ms)
                  .slideY(begin: 0.2),
              const SizedBox(height: 12),
              _buildTOS().animate().fadeIn(delay: 700.ms),
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLogo() {
    return Column(
      children: [
        Container(
          height: 80,
          width: 80,
          decoration: BoxDecoration(
            color: AppColors.primaryGreen,
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.eco, color: Colors.white, size: 44),
        ),
        const SizedBox(height: 20),
        Text(
          'Welcome to EcoEats',
          style: AppFonts.display(
            fontSize: 28,
            fontWeight: FontWeight.w500,
            color: AppColors.onSurface,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 6),
        Text(
          'Share more. Waste less. Impact together.',
          style: AppFonts.body(
            fontSize: 16,
            color: AppColors.onSurfaceVariant,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildDivider() {
    return Divider(color: AppColors.outlineVariant.withValues(alpha: 0.5));
  }

  Widget _buildCommunitySection() {
    return Column(
      children: [
        Text(
          'ASU COMMUNITY ONLY',
          style: AppFonts.body(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Use your asu.edu email to continue.',
          style: AppFonts.body(
            fontSize: 16,
            color: AppColors.onSurfaceVariant,
          ),
        ),
      ],
    );
  }

  Widget _buildEmailField() {
    return Column(
      children: [
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFFF0EDE4),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.outlineVariant),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  style: AppFonts.body(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                    color: AppColors.onSurface,
                  ),
                  decoration: InputDecoration(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    border: InputBorder.none,
                    filled: false,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: const Icon(Icons.check, color: AppColors.onSurface, size: 22),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            const Icon(Icons.check_circle, size: 16, color: AppColors.successEmerald),
            const SizedBox(width: 4),
            Text(
              'Verified ASU email',
              style: AppFonts.body(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.onSurfaceVariant,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildRoleSelection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'I want to...',
          style: AppFonts.body(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: AppColors.onSurface,
            letterSpacing: 0.01,
          ),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(child: _buildRoleCard(UserRole.recipient, 'eco', 'Recipient', 'I want to find food near me.')),
            const SizedBox(width: 12),
            Expanded(child: _buildRoleCard(UserRole.host, 'storefront', 'Host', 'I want to share food.')),
          ],
        ),
      ],
    );
  }

  Widget _buildRoleCard(UserRole role, String iconName, String title, String subtitle) {
    final isSelected = _selectedRole == role;
    return GestureDetector(
      onTap: () => setState(() => _selectedRole = role),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primaryGreen : AppColors.surfaceContainerLow,
          borderRadius: BorderRadius.circular(12),
          boxShadow: isSelected ? AppShadows.card : [],
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  role == UserRole.recipient ? Icons.eco : Icons.storefront,
                  size: 36,
                  color: isSelected ? Colors.white : AppColors.onSurfaceVariant,
                ),
                const SizedBox(height: 10),
                Text(
                  title,
                  style: AppFonts.display(
                    fontSize: 22,
                    fontWeight: FontWeight.w500,
                    color: isSelected ? Colors.white : AppColors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: AppFonts.body(
                    fontSize: 13,
                    color: isSelected
                        ? Colors.white.withValues(alpha: 0.8)
                        : AppColors.onSurfaceVariant,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
              ],
            ),
            if (isSelected)
              Positioned(
                bottom: -20,
                child: Container(
                  width: 24,
                  height: 24,
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.check,
                    size: 14,
                    color: AppColors.primaryGreen,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildFooterText() {
    return Text(
      'EcoEats is for ASU students, staff, and community members.',
      style: AppFonts.display(
        fontSize: 16,
        color: AppColors.onSurfaceVariant,
        height: 1.4,
      ),
      textAlign: TextAlign.center,
    );
  }

  Widget _buildContinueButton(bool isLoading) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: isLoading ? null : _onContinue,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryGreen,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(100),
          ),
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
        child: isLoading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : Stack(
                alignment: Alignment.center,
                children: [
                  Text(
                    'Continue',
                    style: AppFonts.body(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Positioned(
                    right: 0,
                    child: const Icon(Icons.arrow_forward, size: 20),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildTOS() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Text(
        'By continuing, you agree to our\nTerms of Service and Privacy Policy.',
        style: AppFonts.body(
          fontSize: 11,
          color: AppColors.onSurfaceVariant,
          height: 1.5,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  Widget _buildBottomNav() {
    final items = [
      (Icons.search, 'Discover'),
      (Icons.location_on_outlined, 'Map'),
      (Icons.shopping_bag_outlined, 'My Claims'),
      (Icons.person_outline, 'Profile'),
    ];
    return Container(
      decoration: BoxDecoration(
        color: AppColors.backgroundCream,
        border: const Border(
          top: BorderSide(color: AppColors.outlineVariant, width: 0.5),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: items.map((item) {
              final (icon, label) = item;
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, color: AppColors.onSurfaceVariant, size: 22),
                  const SizedBox(height: 2),
                  Text(
                    label,
                    style: AppFonts.body(
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                ],
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}
