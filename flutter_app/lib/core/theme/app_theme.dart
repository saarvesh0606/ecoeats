import 'package:ecoeats/core/constants/app_fonts.dart';
import 'package:flutter/material.dart';

class AppTheme {
  AppTheme._();

  // Brand colors from Stitch designs
  static const Color primaryGreen = Color(0xFF0C3226);
  static const Color primaryDark = Color(0xFF001C13);
  static const Color backgroundCream = Color(0xFFFBF9F4);
  static const Color surfaceContainer = Color(0xFFF0EEE9);
  static const Color surfaceContainerLow = Color(0xFFF5F3EE);
  static const Color surfaceContainerHigh = Color(0xFFEAE8E3);
  static const Color surfaceContainerHighest = Color(0xFFE4E2DD);
  static const Color surfaceDim = Color(0xFFDBDAD5);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color onBackground = Color(0xFF1B1C19);
  static const Color onSurface = Color(0xFF1B1C19);
  static const Color onSurfaceVariant = Color(0xFF414845);
  static const Color outlineColor = Color(0xFF717974);
  static const Color outlineVariant = Color(0xFFC1C8C3);
  static const Color inversePrimary = Color(0xFFA8CFBD);
  static const Color primaryFixed = Color(0xFFC3EBD9);
  static const Color secondaryColor = Color(0xFFA73354);
  static const Color errorColor = Color(0xFFBA1A1A);
  static const Color successEmerald = Color(0xFF2D6A4F);
  static const Color statusGold = Color(0xFFD4AF37);
  static const Color accentMaroon = Color(0xFF8C1D40);

  static ThemeData get lightTheme {
    final colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: primaryGreen,
      onPrimary: onPrimary,
      primaryContainer: primaryGreen,
      onPrimaryContainer: inversePrimary,
      secondary: secondaryColor,
      onSecondary: onPrimary,
      secondaryContainer: const Color(0xFFFF7797),
      onSecondaryContainer: const Color(0xFF750630),
      tertiary: const Color(0xFF201600),
      onTertiary: onPrimary,
      tertiaryContainer: const Color(0xFF3A2A00),
      onTertiaryContainer: const Color(0xFFB98D00),
      error: errorColor,
      onError: onPrimary,
      errorContainer: const Color(0xFFFFDAD6),
      onErrorContainer: const Color(0xFF93000A),
      background: backgroundCream,
      onBackground: onBackground,
      surface: backgroundCream,
      onSurface: onSurface,
      surfaceVariant: surfaceContainerHighest,
      onSurfaceVariant: onSurfaceVariant,
      outline: outlineColor,
      outlineVariant: outlineVariant,
      shadow: Colors.black,
      scrim: Colors.black,
      inverseSurface: const Color(0xFF30312E),
      onInverseSurface: const Color(0xFFF2F1EC),
      inversePrimary: inversePrimary,
      surfaceTint: primaryGreen,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: backgroundCream,
      textTheme: _buildTextTheme(),
      appBarTheme: AppBarTheme(
        backgroundColor: backgroundCream,
        foregroundColor: onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: AppFonts.display(
          fontSize: 22,
          fontWeight: FontWeight.w500,
          color: onSurface,
          letterSpacing: 0.5,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primaryGreen,
          foregroundColor: onPrimary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(100),
          ),
          padding: const EdgeInsets.symmetric(vertical: 16),
          elevation: 0,
          textStyle: AppFonts.body(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: onSurface,
          side: const BorderSide(color: outlineVariant),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(100),
          ),
          padding: const EdgeInsets.symmetric(vertical: 16),
          textStyle: AppFonts.body(
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceContainerHigh,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(100),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        hintStyle: AppFonts.body(
          color: onSurfaceVariant,
          fontSize: 16,
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: surfaceContainerHigh,
        selectedColor: primaryGreen,
        labelStyle: AppFonts.body(fontSize: 13),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(100),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
      cardTheme: const CardThemeData(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(24)),
        ),
        shadowColor: Color(0x0A0C3226),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: backgroundCream,
        selectedItemColor: primaryGreen,
        unselectedItemColor: onSurfaceVariant,
        selectedLabelStyle: AppFonts.body(
          fontSize: 10,
          fontWeight: FontWeight.w700,
        ),
        unselectedLabelStyle: AppFonts.body(
          fontSize: 10,
          fontWeight: FontWeight.w500,
        ),
        elevation: 0,
      ),
    );
  }

  static TextTheme _buildTextTheme() {
    return TextTheme(
      displayLarge: AppFonts.display(
        fontSize: 48,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.02 * 48,
        height: 56 / 48,
      ),
      displayMedium: AppFonts.display(
        fontSize: 40,
        fontWeight: FontWeight.w600,
        height: 48 / 40,
      ),
      displaySmall: AppFonts.display(
        fontSize: 32,
        fontWeight: FontWeight.w500,
        height: 40 / 32,
      ),
      headlineLarge: AppFonts.display(
        fontSize: 32,
        fontWeight: FontWeight.w500,
        height: 40 / 32,
      ),
      headlineMedium: AppFonts.display(
        fontSize: 28,
        fontWeight: FontWeight.w500,
        height: 34 / 28,
      ),
      headlineSmall: AppFonts.display(
        fontSize: 24,
        fontWeight: FontWeight.w500,
        height: 32 / 24,
      ),
      titleLarge: AppFonts.body(
        fontSize: 22,
        fontWeight: FontWeight.w600,
        height: 28 / 22,
        letterSpacing: 0.01 * 22,
      ),
      titleMedium: AppFonts.body(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        height: 28 / 20,
        letterSpacing: 0.01 * 20,
      ),
      titleSmall: AppFonts.body(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        height: 20 / 14,
        letterSpacing: 0.1,
      ),
      bodyLarge: AppFonts.body(
        fontSize: 18,
        fontWeight: FontWeight.w400,
        height: 28 / 18,
      ),
      bodyMedium: AppFonts.body(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        height: 24 / 16,
      ),
      bodySmall: AppFonts.body(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        height: 20 / 14,
      ),
      labelLarge: AppFonts.body(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.1,
      ),
      labelMedium: AppFonts.body(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.5,
      ),
      labelSmall: AppFonts.body(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.05 * 10,
      ),
    );
  }
}
