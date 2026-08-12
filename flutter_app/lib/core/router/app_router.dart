import 'package:ecoeats/domain/entities/food_post.dart';
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

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/sign-in',
    debugLogDiagnostics: false,
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
