import 'package:cached_network_image/cached_network_image.dart';
import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:flutter/material.dart';

/// Renders a food or avatar image from either a bundled asset or a URL.
///
/// Image sources arrive as plain strings on the entities, and they come from
/// two different places: bundled assets today, and whatever the API returns
/// once the mock repositories are replaced. Choosing the loader per string
/// keeps both working at once, so the switch to real data does not have to
/// touch a single call site.
///
/// It also gives every image one error path. The screens previously mixed
/// [Image.network], [NetworkImage] and [CachedNetworkImage], and two of those
/// had no error handling at all — when the original CDN links expired, those
/// sites threw up red framework error boxes instead of degrading.
class AppImage extends StatelessWidget {
  const AppImage({
    super.key,
    required this.source,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.fallbackIcon = Icons.restaurant,
    this.fallbackIconSize,
  });

  final String? source;
  final BoxFit fit;
  final double? width;
  final double? height;
  final IconData fallbackIcon;
  final double? fallbackIconSize;

  /// True when the string points at something in the asset bundle rather than
  /// at the network.
  static bool isAsset(String source) => source.startsWith('assets/');

  /// The [ImageProvider] form, for the few places that need one directly —
  /// `CircleAvatar.backgroundImage`, for instance. Null when there is nothing
  /// to show, so callers can fall back to a child.
  static ImageProvider? providerFor(String? source) {
    if (source == null || source.isEmpty) return null;
    // Returned on separate statements rather than from a ternary: the two
    // branches have no common supertype below Object, so a conditional infers
    // Object and will not assign to ImageProvider.
    if (isAsset(source)) return AssetImage(source);
    return NetworkImage(source);
  }

  Widget _fallback() => Container(
        width: width,
        height: height,
        color: AppColors.surfaceContainerLow,
        child: Icon(
          fallbackIcon,
          size: fallbackIconSize,
          color: AppColors.outlineColor,
        ),
      );

  @override
  Widget build(BuildContext context) {
    final src = source;
    if (src == null || src.isEmpty) return _fallback();

    if (isAsset(src)) {
      return Image.asset(
        src,
        fit: fit,
        width: width,
        height: height,
        errorBuilder: (_, __, ___) => _fallback(),
      );
    }

    return CachedNetworkImage(
      imageUrl: src,
      fit: fit,
      width: width,
      height: height,
      placeholder: (_, __) => Container(
        width: width,
        height: height,
        color: AppColors.surfaceContainerHigh,
        child: const Center(
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: AppColors.primaryGreen,
          ),
        ),
      ),
      errorWidget: (_, __, ___) => _fallback(),
    );
  }
}
