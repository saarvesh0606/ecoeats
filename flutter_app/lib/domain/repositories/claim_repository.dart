import 'package:ecoeats/domain/entities/claim.dart';

abstract class ClaimRepository {
  /// Get all claims for the current user
  Future<List<ClaimEntity>> getMyClaims({ClaimStatus? status});

  /// Get all claims for a specific post (host view)
  Future<List<ClaimEntity>> getPostClaims(String postId);

  /// Claim a food post
  Future<ClaimEntity> claimFood({
    required String postId,
    required String userId,
    int servings = 1,
  });

  /// Update claim status (e.g., mark as picked up)
  Future<void> updateClaimStatus(String claimId, ClaimStatus status);

  /// Cancel a claim
  Future<void> cancelClaim(String claimId);

  /// Get a single claim by ID
  Future<ClaimEntity?> getClaimById(String id);
}
