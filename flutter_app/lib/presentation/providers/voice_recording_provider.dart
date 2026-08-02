import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum RecordingState { idle, recording, processing, done }

class VoiceRecordingState {
  final RecordingState recordingState;
  final Duration duration;
  final String transcript;
  final List<double> waveformBars;

  const VoiceRecordingState({
    this.recordingState = RecordingState.idle,
    this.duration = Duration.zero,
    this.transcript = '',
    this.waveformBars = const [],
  });

  VoiceRecordingState copyWith({
    RecordingState? recordingState,
    Duration? duration,
    String? transcript,
    List<double>? waveformBars,
  }) {
    return VoiceRecordingState(
      recordingState: recordingState ?? this.recordingState,
      duration: duration ?? this.duration,
      transcript: transcript ?? this.transcript,
      waveformBars: waveformBars ?? this.waveformBars,
    );
  }
}

class VoiceRecordingNotifier extends StateNotifier<VoiceRecordingState> {
  Timer? _timer;
  Timer? _waveformTimer;

  VoiceRecordingNotifier() : super(const VoiceRecordingState());

  void startRecording() {
    if (state.recordingState == RecordingState.recording) return;
    state = state.copyWith(
      recordingState: RecordingState.recording,
      duration: Duration.zero,
      waveformBars: _randomBars(20),
    );
    _startTimer();
    _startWaveformAnimation();
  }

  void stopRecording() {
    _timer?.cancel();
    _waveformTimer?.cancel();
    state = state.copyWith(recordingState: RecordingState.processing);
    // Simulate transcription processing
    Future.delayed(const Duration(milliseconds: 1200), () {
      state = state.copyWith(
        recordingState: RecordingState.done,
        transcript:
            'We have extra Mediterranean grain bowls with roasted veggies, chickpeas, and feta. Freshly made this morning. Great option for lunch!',
      );
    });
  }

  void cancelRecording() {
    _timer?.cancel();
    _waveformTimer?.cancel();
    state = const VoiceRecordingState();
  }

  void reset() {
    _timer?.cancel();
    _waveformTimer?.cancel();
    state = const VoiceRecordingState();
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (state.recordingState == RecordingState.recording) {
        state = state.copyWith(
          duration: state.duration + const Duration(seconds: 1),
        );
      }
    });
  }

  void _startWaveformAnimation() {
    _waveformTimer = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (state.recordingState == RecordingState.recording) {
        state = state.copyWith(waveformBars: _randomBars(30));
      }
    });
  }

  List<double> _randomBars(int count) {
    // Pseudo-random waveform heights
    return List.generate(count, (i) {
      final seed = (i * 7 + DateTime.now().millisecond) % 10;
      return 0.2 + (seed / 10.0) * 0.8;
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _waveformTimer?.cancel();
    super.dispose();
  }
}

final voiceRecordingProvider =
    StateNotifierProvider.autoDispose<VoiceRecordingNotifier, VoiceRecordingState>((ref) {
  return VoiceRecordingNotifier();
});

// Format duration as MM:SS
String formatDuration(Duration d) {
  final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
  final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}
