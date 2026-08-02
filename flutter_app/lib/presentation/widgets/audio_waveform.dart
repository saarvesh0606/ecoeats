import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:flutter/material.dart';

class AudioWaveform extends StatelessWidget {
  final List<double> bars;
  final bool isActive;

  const AudioWaveform({
    super.key,
    required this.bars,
    this.isActive = true,
  });

  @override
  Widget build(BuildContext context) {
    final displayBars = bars.isEmpty
        ? List.generate(30, (i) {
            // Static default waveform
            const heights = [
              0.3, 0.5, 0.8, 0.4, 0.9, 0.6, 1.0, 0.5, 0.7, 0.4,
              0.9, 0.3, 0.6, 0.8, 0.5, 0.7, 0.4, 0.9, 0.3, 0.5,
              0.4, 0.7, 0.5, 0.8, 0.4, 0.6, 0.3, 0.5, 0.4, 0.3,
            ];
            return heights[i % heights.length];
          })
        : bars;

    return SizedBox(
      height: 56,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: displayBars.asMap().entries.map((entry) {
          final i = entry.key;
          final height = entry.value;
          final isGray = i >= displayBars.length * 0.6;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 100),
            width: 3,
            height: (height * 52).clamp(6.0, 52.0),
            margin: const EdgeInsets.symmetric(horizontal: 1.5),
            decoration: BoxDecoration(
              color: isGray
                  ? AppColors.surfaceContainerHigh
                  : (isActive
                      ? AppColors.onSurface
                      : AppColors.outlineVariant),
              borderRadius: BorderRadius.circular(2),
            ),
          );
        }).toList(),
      ),
    );
  }
}
