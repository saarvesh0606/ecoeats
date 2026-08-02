import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  static const Color primaryGreen = Color(0xFF0C3226);
  static const Color backgroundCream = Color(0xFFFBF9F4);
  static const Color surfaceContainer = Color(0xFFF0EEE9);
  static const Color surfaceContainerLow = Color(0xFFF5F3EE);
  static const Color surfaceContainerHigh = Color(0xFFEAE8E3);
  static const Color surfaceContainerHighest = Color(0xFFE4E2DD);
  static const Color surfaceDim = Color(0xFFDBDAD5);
  static const Color onSurface = Color(0xFF1B1C19);
  static const Color onSurfaceVariant = Color(0xFF414845);
  static const Color outlineVariant = Color(0xFFC1C8C3);
  static const Color outlineColor = Color(0xFF717974);
  static const Color inversePrimary = Color(0xFFA8CFBD);
  static const Color secondaryColor = Color(0xFFA73354);
  static const Color errorColor = Color(0xFFBA1A1A);
  static const Color successEmerald = Color(0xFF2D6A4F);
  static const Color statusGold = Color(0xFFD4AF37);
  static const Color asuMaroon = Color(0xFF8C1D40);
  static const Color liveGreen = Color(0xFF34C759);
  static const Color white = Colors.white;
}

class AppSpacing {
  AppSpacing._();

  static const double xs = 4.0;
  static const double sm = 8.0;
  static const double md = 16.0;
  static const double lg = 24.0;
  static const double xl = 32.0;
  static const double xxl = 48.0;
  static const double marginMobile = 20.0;
  static const double gutter = 24.0;
}

class AppRadius {
  AppRadius._();

  static const double sm = 8.0;
  static const double md = 12.0;
  static const double lg = 16.0;
  static const double xl = 20.0;
  static const double xxl = 24.0;
  static const double xxxl = 32.0;
  static const double full = 100.0;
}

class AppShadows {
  AppShadows._();

  static List<BoxShadow> card = [
    BoxShadow(
      color: const Color(0xFF0C3226).withOpacity(0.04),
      blurRadius: 20,
      offset: const Offset(0, 4),
    ),
    BoxShadow(
      color: Colors.black.withOpacity(0.02),
      blurRadius: 4,
      offset: const Offset(0, 2),
    ),
  ];

  static List<BoxShadow> button = [
    BoxShadow(
      color: const Color(0xFF0C3226).withOpacity(0.15),
      blurRadius: 14,
      offset: const Offset(0, 4),
    ),
  ];
}
