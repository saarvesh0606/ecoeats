import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/core/constants/app_fonts.dart';
import 'package:ecoeats/domain/entities/user.dart';
import 'package:ecoeats/presentation/providers/auth_provider.dart';
import 'package:ecoeats/presentation/widgets/app_image.dart';
import 'package:ecoeats/presentation/widgets/password_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class HostSignInScreen extends ConsumerStatefulWidget {
  const HostSignInScreen({super.key});

  @override
  ConsumerState<HostSignInScreen> createState() => _HostSignInScreenState();
}

class _HostSignInScreenState extends ConsumerState<HostSignInScreen> {
  final _emailController = TextEditingController(text: 'host@asu.edu');
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  UserRole _selectedRole = UserRole.host;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _onContinue() async {
    final notifier = ref.read(authNotifierProvider.notifier);
    await notifier.signIn(
      email: _emailController.text.trim(),
      password: _passwordController.text,
      role: _selectedRole,
    );
    if (!mounted) return;
    final authState = ref.read(authNotifierProvider);
    authState.whenOrNull(
      data: (user) {
        if (user != null) {
          if (user.isHost) {
            context.go('/host/dashboard');
          } else {
            context.go('/recipient/discover');
          }
        }
      },
      error: (e, _) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authNotifierProvider);
    final isLoading = authState.isLoading;

    return Scaffold(
      backgroundColor: AppColors.backgroundCream,
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildHeader(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 8),
                  _buildEmailField()
                      .animate()
                      .fadeIn(delay: 200.ms)
                      .slideY(begin: 0.2),
                  const SizedBox(height: 12),
                  PasswordField(
                    controller: _passwordController,
                    obscured: _obscurePassword,
                    onToggleObscured: () =>
                        setState(() => _obscurePassword = !_obscurePassword),
                    onSubmitted: (_) => _onContinue(),
                  ).animate().fadeIn(delay: 250.ms).slideY(begin: 0.2),
                  const SizedBox(height: 12),
                  _buildCommunityNotice()
                      .animate()
                      .fadeIn(delay: 300.ms)
                      .slideY(begin: 0.2),
                  const SizedBox(height: 20),
                  _buildRoleSelection()
                      .animate()
                      .fadeIn(delay: 400.ms)
                      .slideY(begin: 0.2),
                  const SizedBox(height: 24),
                  _buildContinueButton(isLoading)
                      .animate()
                      .fadeIn(delay: 500.ms)
                      .slideY(begin: 0.2),
                  const SizedBox(height: 12),
                  _buildSSOFooter()
                      .animate()
                      .fadeIn(delay: 600.ms),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return SizedBox(
      height: 240,
      child: Stack(
        children: [
          Positioned.fill(
            child: ShaderMask(
              shaderCallback: (rect) => const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.black, Colors.transparent],
                stops: [0.6, 1.0],
              ).createShader(rect),
              blendMode: BlendMode.dstIn,
              child: const AppImage(
                source: 'assets/images/asu_campus.jpg',
                fit: BoxFit.cover,
              ),
            ),
          ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: Column(
                children: [
                  Text(
                    'Welcome to EcoEats',
                    style: AppFonts.display(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: AppColors.onSurface,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Share more. Waste less. Impact together.',
                    style: AppFonts.body(
                      fontSize: 13,
                      color: AppColors.onSurfaceVariant,
                      fontWeight: FontWeight.w500,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmailField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          decoration: BoxDecoration(
            color: AppColors.backgroundCream,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.outlineVariant),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  style: AppFonts.body(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: AppColors.onSurface,
                  ),
                  decoration: InputDecoration(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    border: InputBorder.none,
                    hintText: 'Enter your @asu.edu email',
                    hintStyle: AppFonts.body(
                      color: AppColors.onSurfaceVariant,
                    ),
                    filled: false,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 14),
                child: Icon(
                  Icons.check,
                  color: AppColors.onSurface,
                  size: 20,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.only(left: 4),
          child: Text(
            'Use your asu.edu email to continue',
            style: AppFonts.body(
              fontSize: 12,
              color: AppColors.onSurfaceVariant,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCommunityNotice() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF8F4EA),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFEBE5D8).withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ASU COMMUNITY ONLY',
            style: AppFonts.body(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.asuMaroon,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'EcoEats is for students, faculty,\nand staff at Arizona State University.',
            style: AppFonts.body(
              fontSize: 13,
              color: AppColors.onSurface,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRoleSelection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'I want to...',
          style: AppFonts.body(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _buildRoleCard(UserRole.host)),
            const SizedBox(width: 12),
            Expanded(child: _buildRoleCard(UserRole.recipient)),
          ],
        ),
      ],
    );
  }

  Widget _buildRoleCard(UserRole role) {
    final isSelected = _selectedRole == role;
    final isHost = role == UserRole.host;

    return GestureDetector(
      onTap: () => setState(() => _selectedRole = role),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        height: 200,
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primaryGreen : const Color(0xFFF8F4EA),
          borderRadius: BorderRadius.circular(32),
          border: Border.all(
            color: isSelected ? AppColors.primaryGreen : const Color(0xFFEBE5D8),
            width: 2,
          ),
        ),
        child: Stack(
          children: [
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  const SizedBox(height: 8),
                  Icon(
                    isHost ? Icons.storefront : Icons.eco,
                    size: 48,
                    color: isSelected
                        ? Colors.white
                        : AppColors.onSurfaceVariant,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    isHost ? 'Host' : 'Recipient',
                    style: AppFonts.display(
                      fontSize: 20,
                      color: isSelected ? Colors.white : AppColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    isHost
                        ? 'I have extra food\nto share.'
                        : 'I want to find\nfood near me.',
                    style: AppFonts.body(
                      fontSize: 11,
                      color: isSelected
                          ? Colors.white.withValues(alpha: 0.8)
                          : AppColors.onSurfaceVariant,
                      fontWeight: FontWeight.w500,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
            Positioned(
              bottom: 16,
              left: 0,
              right: 0,
              child: Center(
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: isSelected ? Colors.white : Colors.transparent,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isSelected
                          ? Colors.white
                          : AppColors.outlineVariant,
                      width: 1.5,
                    ),
                  ),
                  child: isSelected
                      ? Icon(Icons.check, size: 14, color: AppColors.primaryGreen)
                      : null,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContinueButton(bool isLoading) {
    return ElevatedButton(
      onPressed: isLoading ? null : _onContinue,
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primaryGreen,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(100),
        ),
        padding: const EdgeInsets.symmetric(vertical: 16),
        elevation: 0,
      ),
      child: isLoading
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'Continue',
                  style: AppFonts.body(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 48),
                const Icon(Icons.arrow_forward, size: 18),
              ],
            ),
    );
  }

  Widget _buildSSOFooter() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.lock_outline, size: 14, color: AppColors.onSurfaceVariant),
        const SizedBox(width: 6),
        Text.rich(
          TextSpan(
            children: [
              TextSpan(
                text: 'ASU ',
                style: AppFonts.body(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurface,
                ),
              ),
              TextSpan(
                text: 'Single Sign-On',
                style: AppFonts.body(
                  fontSize: 13,
                  color: AppColors.onSurface,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
