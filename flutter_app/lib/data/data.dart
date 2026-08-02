// Placeholder for future integration with real backend
// Currently using mock implementations

// To add a real backend:
// 1. Create FirebaseAuthRepository implementing AuthRepository
// 2. Create FirestorePostRepository implementing PostRepository
// 3. Create FirestoreClaimRepository implementing ClaimRepository
// 4. Swap the Provider implementations in auth_provider.dart

// Example Firebase integration:
// final authRepositoryProvider = Provider<AuthRepository>((ref) {
//   return FirebaseAuthRepository();
// });
