import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// The two typefaces the product uses, in one place.
///
/// Playfair Display carries the headings and Inter carries everything else —
/// the same editorial pairing the React Native client ships, so the two
/// codebases read as one product rather than two interpretations of it.
///
/// Screens call these instead of reaching for [GoogleFonts] directly. The
/// screens previously each named their own family, which is how the app ended
/// up with a heading face in some places and a different one in others; a
/// change of typeface should be one edit, not nine.
abstract final class AppFonts {
  /// Headings, numerals that carry weight, anything editorial.
  static TextStyle display({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? height,
    double? letterSpacing,
  }) {
    return GoogleFonts.playfairDisplay(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      height: height,
      letterSpacing: letterSpacing,
    );
  }

  /// Body copy, labels, controls.
  static TextStyle body({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? height,
    double? letterSpacing,
    List<Shadow>? shadows,
  }) {
    return GoogleFonts.inter(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      height: height,
      letterSpacing: letterSpacing,
      shadows: shadows,
    );
  }
}
