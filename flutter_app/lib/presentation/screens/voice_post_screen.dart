import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:ecoeats/presentation/providers/posts_provider.dart';
import 'package:ecoeats/presentation/providers/voice_recording_provider.dart';
import 'package:ecoeats/presentation/widgets/audio_waveform.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

class VoicePostScreen extends ConsumerStatefulWidget {
  const VoicePostScreen({super.key});

  @override
  ConsumerState<VoicePostScreen> createState() => _VoicePostScreenState();
}

class _VoicePostScreenState extends ConsumerState<VoicePostScreen> {
  bool _isVoiceMode = true;

  @override
  Widget build(BuildContext context) {
    final recordingState = ref.watch(voiceRecordingProvider);

    return Scaffold(
      backgroundColor: AppColors.backgroundCream,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(context),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 24),
                    _buildEntryModeSelector(),
                    const SizedBox(height: 32),
                    if (_isVoiceMode) ...[
                      _buildVoiceSection(recordingState),
                    ] else ...[
                      _buildManualEntry(),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      child: Row(
        children: [
          IconButton(
            onPressed: () => context.pop(),
            icon: const Icon(Icons.close),
            color: AppColors.onSurface,
          ),
          Expanded(
            child: Text(
              'Create a Post',
              style: GoogleFonts.ebGaramond(
                fontSize: 20,
                fontWeight: FontWeight.w500,
                color: AppColors.onSurface,
              ),
              textAlign: TextAlign.center,
            ),
          ),
          TextButton(
            onPressed: () {},
            child: Text(
              'Save Draft',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: AppColors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEntryModeSelector() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: AppColors.outlineVariant.withOpacity(0.5)),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildModeButton('Voice Entry', _isVoiceMode, () {
              setState(() => _isVoiceMode = true);
            }),
          ),
          Expanded(
            child: _buildModeButton('Manual Entry', !_isVoiceMode, () {
              setState(() => _isVoiceMode = false);
            }),
          ),
        ],
      ),
    );
  }

  Widget _buildModeButton(String label, bool isSelected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primaryGreen : Colors.transparent,
          borderRadius: BorderRadius.circular(100),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 4,
                    offset: const Offset(0, 1),
                  )
                ]
              : [],
        ),
        child: Text(
          label,
          style: GoogleFonts.hankenGrotesk(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: isSelected ? Colors.white : AppColors.onSurfaceVariant,
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Widget _buildVoiceSection(VoiceRecordingState state) {
    return Column(
      children: [
        Text(
          state.recordingState == RecordingState.recording
              ? 'Listening...'
              : 'Tap to speak about the food',
          style: GoogleFonts.hankenGrotesk(
            fontSize: 14,
            color: AppColors.onSurfaceVariant,
            fontWeight: FontWeight.w500,
          ),
        ).animate().fadeIn(),
        const SizedBox(height: 40),
        AudioWaveform(
          bars: state.waveformBars,
          isActive: state.recordingState == RecordingState.recording,
        ),
        const SizedBox(height: 32),
        _buildRecordingControls(state),
        const SizedBox(height: 32),
        if (state.transcript.isNotEmpty)
          _buildTranscriptBox(state.transcript)
              .animate()
              .fadeIn()
              .slideY(begin: 0.2),
        const SizedBox(height: 24),
        _buildPhotosSection(),
        const SizedBox(height: 24),
        if (state.recordingState == RecordingState.done)
          _buildNextButton()
              .animate()
              .fadeIn(delay: 300.ms)
              .slideY(begin: 0.2),
      ],
    );
  }

  Widget _buildRecordingControls(VoiceRecordingState state) {
    final isRecording = state.recordingState == RecordingState.recording;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        SizedBox(
          width: 64,
          child: Text(
            formatDuration(state.duration),
            style: GoogleFonts.hankenGrotesk(
              fontSize: 15,
              fontWeight: FontWeight.w500,
              color: AppColors.primaryGreen,
            ),
          ),
        ),
        GestureDetector(
          onTap: () {
            if (isRecording) {
              ref.read(voiceRecordingProvider.notifier).stopRecording();
            } else {
              ref.read(voiceRecordingProvider.notifier).startRecording();
            }
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: 84,
            height: 84,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              border: Border.all(
                color: AppColors.surfaceContainerLow,
                width: 2,
              ),
              boxShadow: AppShadows.button,
            ),
            child: Center(
              child: Container(
                width: 74,
                height: 74,
                decoration: const BoxDecoration(
                  color: AppColors.primaryGreen,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  isRecording ? Icons.stop : Icons.mic,
                  color: Colors.white,
                  size: 32,
                ),
              ),
            ),
          ),
        ),
        SizedBox(
          width: 64,
          child: TextButton(
            onPressed: () {
              ref.read(voiceRecordingProvider.notifier).cancelRecording();
            },
            child: Text(
              'Cancel',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: AppColors.onSurface,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTranscriptBox(String text) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Text(
        text,
        style: GoogleFonts.hankenGrotesk(
          fontSize: 14,
          color: AppColors.onSurface,
          height: 1.6,
        ),
      ),
    );
  }

  Widget _buildPhotosSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Add Photos',
          style: GoogleFonts.hankenGrotesk(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 88,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              _buildPhotoThumbnail(
                'https://lh3.googleusercontent.com/aida-public/AB6AXuD7cstN-qE9shtgHctHzywBV4XAEgiN9cvhWg7cvJs5-i6qu2d9lNNFZy1luZCUk4i82WM_38-V3z4wiGn0fTVN1Bxc40OGLpsQC1ArSDPKnnanh7kOBsUd_79YRvDxqRFb9nWz_KuvpgHlgFXs80CyGusEBHtRZfnEcxZaFd_mMTyPQfEgu8WnYbER32SpDjU0Ons5o2cgNDcQVx3VqMmgb5LJmsrxQFxNfKF7sqfz5KWsL2GKzGiLIw',
              ),
              const SizedBox(width: 10),
              _buildPhotoThumbnail(
                'https://lh3.googleusercontent.com/aida-public/AB6AXuCmgk4JMcVzVatuKEhS9H6Q4zMUMPIPs1OZ7R9x9d-QqIrUHVOPT7wbTOuTaM4tZIhlkU3LgvEwavmQPM-nmBkGS2TiLBwKTkqGjQEHYOISeNrRstNrfNxxSBk9AWn4ZELWqkKwxEK055jibJHYMXMyVRgCFtDhwZ5kouhoL5sVmWwalQ0Xoi_rTBUaT_-CRI3gDApDvsS4VJrGtEeCvouTeIl6RIESEVhVB0TR6geR9RrLGkN70CVl7Q',
              ),
              const SizedBox(width: 10),
              _buildPhotoThumbnail(
                'https://lh3.googleusercontent.com/aida-public/AB6AXuC1ErupoO8Y7E24dH95DEXydN-7__v2NucZonWm5mE5W3UdgwzOq9C_c8GO2VjGYjJnz0HQC0vckSMnwa2NEiA3ib_S6WT43AcvhrrfEYGD4oR6a7xgQ5CGK48KnSyZSw0aQfhFVL9tGTWnP8-eB1BCy2xzFDr9rkwiDq7n00swJgahKhwXTWXLqeJotjLMZgwZWkoQuqfZgNa5XuaVHbmFm7mQ1tYq--x3DHbxSPlyFUlAbwxzHSq-iA',
              ),
              const SizedBox(width: 10),
              _buildAddPhotoButton(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildPhotoThumbnail(String url) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: 84,
        height: 84,
        child: Image.network(
          url,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(
            color: AppColors.surfaceContainerLow,
          ),
        ),
      ),
    );
  }

  Widget _buildAddPhotoButton() {
    return GestureDetector(
      onTap: () {},
      child: Container(
        width: 84,
        height: 84,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppColors.outlineVariant,
            style: BorderStyle.solid,
          ),
        ),
        child: const Icon(Icons.add, color: AppColors.onSurfaceVariant, size: 28),
      ),
    );
  }

  Widget _buildNextButton() {
    final draft = ref.read(postDraftProvider);
    final recordingState = ref.read(voiceRecordingProvider);
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: () {
          // Update draft with transcript
          ref.read(postDraftProvider.notifier).state = draft.copyWith(
            description: recordingState.transcript,
            title: 'Mediterranean Grain Bowl',
          );
          context.push('/host/review-publish');
        },
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryGreen,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: Text(
          'Next: Review & Publish',
          style: GoogleFonts.hankenGrotesk(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _buildManualEntry() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildTextField('Title', 'e.g. Mediterranean Grain Bowls'),
        const SizedBox(height: 16),
        _buildTextField('Description', 'Describe the food...', maxLines: 4),
        const SizedBox(height: 16),
        _buildPhotosSection(),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: () => context.push('/host/review-publish'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryGreen,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: Text(
              'Next: Review & Publish',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
        const SizedBox(height: 40),
      ],
    );
  }

  Widget _buildTextField(String label, String hint, {int maxLines = 1}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.hankenGrotesk(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          maxLines: maxLines,
          style: GoogleFonts.hankenGrotesk(
            fontSize: 15,
            color: AppColors.onSurface,
          ),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: GoogleFonts.hankenGrotesk(
              color: AppColors.onSurfaceVariant,
            ),
            filled: true,
            fillColor: AppColors.surfaceContainerLow,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppColors.outlineVariant),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppColors.outlineVariant),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppColors.primaryGreen, width: 1.5),
            ),
          ),
        ),
      ],
    );
  }
}
