import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/core/constants/app_fonts.dart';
import 'package:flutter/material.dart';

/// Password entry, styled to sit under the email field on both sign-in screens.
///
/// The app collected only an email before, which was fine while sign-in was a
/// mock. The API only accepts a verified Firebase token, and there is no way to
/// obtain one from an email address alone.
class PasswordField extends StatelessWidget {
  const PasswordField({
    super.key,
    required this.controller,
    required this.obscured,
    required this.onToggleObscured,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final bool obscured;
  final VoidCallback onToggleObscured;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.backgroundCream,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              obscureText: obscured,
              // Lets a password manager recognise the field and offer to fill
              // or save it.
              autofillHints: const [AutofillHints.password],
              textInputAction: TextInputAction.go,
              onSubmitted: onSubmitted,
              style: AppFonts.body(
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: AppColors.onSurface,
              ),
              decoration: InputDecoration(
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                border: InputBorder.none,
                hintText: 'Password',
                hintStyle: AppFonts.body(color: AppColors.onSurfaceVariant),
                filled: false,
              ),
            ),
          ),
          IconButton(
            onPressed: onToggleObscured,
            icon: Icon(
              obscured
                  ? Icons.visibility_outlined
                  : Icons.visibility_off_outlined,
              size: 20,
              color: AppColors.onSurfaceVariant,
            ),
            tooltip: obscured ? 'Show password' : 'Hide password',
          ),
        ],
      ),
    );
  }
}
