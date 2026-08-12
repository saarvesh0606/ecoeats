import 'package:firebase_core/firebase_core.dart';

/// Firebase configuration, read from the build environment.
///
/// Supply it with a file rather than six flags:
///
///     flutter run -d web-server --web-port 19006 \
///       --dart-define-from-file=dart_define.json
///
/// The values are not checked in. They are public by design for a web app —
/// Firebase security comes from rules and token verification, not from hiding
/// the config — but project configuration still does not belong in the repo,
/// which is the same call the React Native client made with its `.env`.
///
/// ⚠️ These are the **web** values, and they are all a Flutter web build needs.
/// A native Android or iOS build is a separate registration in the Firebase
/// console (`google-services.json` / `GoogleService-Info.plist`); the web SDK
/// does not use those files.
abstract final class DefaultFirebaseOptions {
  static const String _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const String _authDomain =
      String.fromEnvironment('FIREBASE_AUTH_DOMAIN');
  static const String _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const String _storageBucket =
      String.fromEnvironment('FIREBASE_STORAGE_BUCKET');
  static const String _messagingSenderId =
      String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const String _appId = String.fromEnvironment('FIREBASE_APP_ID');

  /// False when the app was built without the config. Startup checks this and
  /// carries on with the mock repositories rather than crashing on a missing
  /// API key — a misconfigured build should still show you an app.
  static bool get isConfigured => _apiKey.isNotEmpty && _appId.isNotEmpty;

  static FirebaseOptions get current => const FirebaseOptions(
        apiKey: _apiKey,
        authDomain: _authDomain,
        projectId: _projectId,
        storageBucket: _storageBucket,
        messagingSenderId: _messagingSenderId,
        appId: _appId,
      );
}
