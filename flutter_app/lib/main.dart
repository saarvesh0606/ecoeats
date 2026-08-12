import 'package:ecoeats/core/firebase_options.dart';
import 'package:ecoeats/core/router/app_router.dart';
import 'package:ecoeats/core/theme/app_theme.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Only when the build was given a config. A build without one still runs —
  // it falls back to the in-memory repositories — so a missing --dart-define
  // costs you real data, not the whole app.
  if (DefaultFirebaseOptions.isConfigured) {
    try {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.current);
    } catch (error, stack) {
      // A bad key or a blocked network must not leave a white screen with
      // nothing to go on.
      debugPrint('Firebase failed to start: $error\n$stack');
    }
  }

  runApp(const ProviderScope(child: EcoEatsApp()));
}

class EcoEatsApp extends ConsumerWidget {
  const EcoEatsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'EcoEats',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      routerConfig: router,
    );
  }
}
