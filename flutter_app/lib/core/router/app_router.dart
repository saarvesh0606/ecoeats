import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:ecoeats/domain/entities/user.dart';
import 'package:ecoeats/presentation/providers/auth_provider.dart';
import 'package:ecoeats/presentation/screens/claim_screen.dart';
import 'package:ecoeats/presentation/screens/discover_screen.dart';
import 'package:ecoeats/presentation/screens/host_dashboard_screen.dart';
import 'package:ecoeats/presentation/screens/host_sign_in_screen.dart';
import 'package:ecoeats/presentation/screens/my_claims_screen.dart';
import 'package:ecoeats/presentation/screens/post_management_screen.dart';
import 'package:ecoeats/presentation/screens/recipient_login_screen.dart';
import 'package:ecoeats/presentation/screens/review_publish_screen.dart';
import 'package:ecoeats/presentation/screens/voice_post_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Routes anyone may open without being signed in.
const _publicRoutes = {'/sign-in', '/recipient-login'};

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/sign-in',
    debugLogDiagnostics: false,
    // Every route used to be reachable by typing its URL, signed in or not —
    // and the screens behind them assume a user exists. `refreshListenable`
    // is what makes this re-run on sign-out; without it the guard is only
    // consulted on navigation, so a session ending would leave whoever was
    // there still looking at the page.
    refreshListenable: _AuthChangeNotifier(ref),
    redirect: (context, state) {
      final user = ref.read(currentUserProvider);
      final atPublicRoute = _publicRoutes.contains(state.matchedLocation);

      if (user == null) return atPublicRoute ? null : '/sign-in';
      // Bounce a signed-in user off the sign-in screen rather than letting
      // them log in twice — to their own side of the app, since a recipient
      // has no business landing on the host dashboard.
      if (atPublicRoute) {
        return user.isHost ? '/host/dashboard' : '/recipient/discover';
      }
      return null;
    },
    routes: [
      // ── Auth ──────────────────────────────────────────────────────────────
      GoRoute(
        path: '/sign-in',
        name: 'sign-in',
        builder: (context, state) => const HostSignInScreen(),
      ),
      GoRoute(
        path: '/recipient-login',
        name: 'recipient-login',
        builder: (context, state) => const RecipientLoginScreen(),
      ),

      // ── Host Routes ───────────────────────────────────────────────────────
      GoRoute(
        path: '/host/dashboard',
        name: 'host-dashboard',
        builder: (context, state) => const HostDashboardScreen(),
      ),
      GoRoute(
        path: '/host/create-post',
        name: 'create-post',
        builder: (context, state) => const VoicePostScreen(),
      ),
      GoRoute(
        path: '/host/post-management',
        name: 'post-management',
        builder: (context, state) {
          final post = state.extra as FoodPostEntity?;
          if (post != null) {
            return PostManagementScreen(post: post);
          }
          // Fallback with sample post
          return PostManagementScreen(
            post: FoodPostEntity(
              id: 'demo',
              hostId: 'host_001',
              hostName: 'Demo Host',
              title: 'Mediterranean Grain Bowl',
              description: 'Fresh grain bowl',
              imageUrls: [
                'assets/images/food_grain_bowl.jpg'
              ],
              totalQuantity: 45,
              remainingQuantity: 18,
              dietaryTags: [DietaryTag.vegetarian, DietaryTag.glutenFree],
              locationName: 'Memorial Union – MU Market',
              locationAddress: '301 E Orange Mall, Tempe, AZ 85281',
              expiresAt: DateTime.now().add(const Duration(minutes: 28)),
              createdAt: DateTime.now(),
            ),
          );
        },
      ),
      GoRoute(
        path: '/host/review-publish',
        name: 'review-publish',
        builder: (context, state) => const ReviewPublishScreen(),
      ),

      // ── Recipient Routes ──────────────────────────────────────────────────
      GoRoute(
        path: '/recipient/discover',
        name: 'discover',
        builder: (context, state) => const DiscoverScreen(),
      ),
      GoRoute(
        path: '/recipient/claim',
        name: 'claim',
        builder: (context, state) => const ClaimScreen(),
      ),
      GoRoute(
        path: '/recipient/my-claims',
        name: 'my-claims',
        builder: (context, state) => const MyClaimsScreen(),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48),
            const SizedBox(height: 16),
            Text('Page not found: ${state.uri}'),
          ],
        ),
      ),
    ),
  );
});

/// Nudges GoRouter to re-run its redirect whenever the signed-in user changes.
///
/// GoRouter only consults `redirect` when something asks it to navigate, so
/// without this a sign-out would leave the previous screen on display until the
/// next tap — showing one user's data to whoever is holding the phone next.
class _AuthChangeNotifier extends ChangeNotifier {
  _AuthChangeNotifier(Ref ref) {
    _subscription = ref.listen<UserEntity?>(
      currentUserProvider,
      (_, __) => notifyListeners(),
    );
  }

  late final ProviderSubscription<UserEntity?> _subscription;

  @override
  void dispose() {
    _subscription.close();
    super.dispose();
  }
}
