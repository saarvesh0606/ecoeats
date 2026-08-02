import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

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
  static const Color asuMaroon = Color(0xFF8C1D40);

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
        titleTextStyle: GoogleFonts.ebGaramond(
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
          textStyle: GoogleFonts.hankenGrotesk(
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
          textStyle: GoogleFonts.hankenGrotesk(
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
        hintStyle: GoogleFonts.hankenGrotesk(
          color: onSurfaceVariant,
          fontSize: 16,
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: surfaceContainerHigh,
        selectedColor: primaryGreen,
        labelStyle: GoogleFonts.hankenGrotesk(fontSize: 13),
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
        selectedLabelStyle: GoogleFonts.hankenGrotesk(
          fontSize: 10,
          fontWeight: FontWeight.w700,
        ),
        unselectedLabelStyle: GoogleFonts.hankenGrotesk(
          fontSize: 10,
          fontWeight: FontWeight.w500,
        ),
        elevation: 0,
      ),
    );
  }

  static TextTheme _buildTextTheme() {
    return TextTheme(
      displayLarge: GoogleFonts.ebGaramond(
        fontSize: 48,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.02 * 48,
        height: 56 / 48,
      ),
      displayMedium: GoogleFonts.ebGaramond(
        fontSize: 40,
        fontWeight: FontWeight.w600,
        height: 48 / 40,
      ),
      displaySmall: GoogleFonts.ebGaramond(
        fontSize: 32,
        fontWeight: FontWeight.w500,
        height: 40 / 32,
      ),
      headlineLarge: GoogleFonts.ebGaramond(
        fontSize: 32,
        fontWeight: FontWeight.w500,
        height: 40 / 32,
      ),
      headlineMedium: GoogleFonts.ebGaramond(
        fontSize: 28,
        fontWeight: FontWeight.w500,
        height: 34 / 28,
      ),
      headlineSmall: GoogleFonts.ebGaramond(
        fontSize: 24,
        fontWeight: FontWeight.w500,
        height: 32 / 24,
      ),
      titleLarge: GoogleFonts.hankenGrotesk(
        fontSize: 22,
        fontWeight: FontWeight.w600,
        height: 28 / 22,
        letterSpacing: 0.01 * 22,
      ),
      titleMedium: GoogleFonts.hankenGrotesk(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        height: 28 / 20,
        letterSpacing: 0.01 * 20,
      ),
      titleSmall: GoogleFonts.hankenGrotesk(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        height: 20 / 14,
        letterSpacing: 0.1,
      ),
      bodyLarge: GoogleFonts.hankenGrotesk(
        fontSize: 18,
        fontWeight: FontWeight.w400,
        height: 28 / 18,
      ),
      bodyMedium: GoogleFonts.hankenGrotesk(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        height: 24 / 16,
      ),
      bodySmall: GoogleFonts.hankenGrotesk(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        height: 20 / 14,
      ),
      labelLarge: GoogleFonts.hankenGrotesk(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.1,
      ),
      labelMedium: GoogleFonts.hankenGrotesk(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.5,
      ),
      labelSmall: GoogleFonts.hankenGrotesk(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.05 * 10,
      ),
    );
  }
}
