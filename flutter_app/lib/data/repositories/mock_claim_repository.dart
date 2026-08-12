import 'package:ecoeats/domain/entities/claim.dart';
import 'package:ecoeats/domain/repositories/claim_repository.dart';
import 'package:uuid/uuid.dart';

class MockClaimRepository implements ClaimRepository {
  final List<ClaimEntity> _claims = _generateMockClaims();
  final _uuid = const Uuid();

  static List<ClaimEntity> _generateMockClaims() {
    final now = DateTime.now();
    return [
      ClaimEntity(
        id: 'claim_001',
        postId: 'post_001',
        userId: 'current_user',
        postTitle: 'Mediterranean Grain Bowl',
        postImageUrl:
            'assets/images/food_grain_bowl.jpg',
        locationName: 'Hassayampa Academic Village',
        locationAddress: '699 S Mill Ave, Tempe, AZ 85281',
        status: ClaimStatus.reserved,
        claimedAt: now.subtract(const Duration(minutes: 5)),
        pickupWindowStart: now.copyWith(hour: 10, minute: 0, second: 0),
        pickupWindowEnd: now.copyWith(hour: 12, minute: 0, second: 0),
        servingsClaimed: 1,
      ),
    ];
  }

  @override
  Future<List<ClaimEntity>> getMyClaims({ClaimStatus? status}) async {
    await Future.delayed(const Duration(milliseconds: 300));
    if (status == null) return List<ClaimEntity>.from(_claims);
    return _claims.where((c) => c.status == status).toList();
  }

  @override
  Future<List<ClaimEntity>> getPostClaims(String postId) async {
    await Future.delayed(const Duration(milliseconds: 300));
    return _claims.where((c) => c.postId == postId).toList();
  }

  @override
  Future<ClaimEntity> claimFood({
    required String postId,
    required String userId,
    int servings = 1,
  }) async {
    await Future.delayed(const Duration(milliseconds: 500));
    final now = DateTime.now();
    final claim = ClaimEntity(
      id: _uuid.v4(),
      postId: postId,
      userId: userId,
      postTitle: 'Food Item',
      locationName: 'ASU Campus',
      locationAddress: 'Tempe, AZ 85281',
      status: ClaimStatus.reserved,
      claimedAt: now,
      pickupWindowStart: now,
      pickupWindowEnd: now.add(const Duration(hours: 2)),
      servingsClaimed: servings,
    );
    _claims.add(claim);
    return claim;
  }

  @override
  Future<void> updateClaimStatus(String claimId, ClaimStatus status) async {
    await Future.delayed(const Duration(milliseconds: 300));
    final index = _claims.indexWhere((c) => c.id == claimId);
    if (index != -1) {
      _claims[index] = _claims[index].copyWith(status: status);
    }
  }

  @override
  Future<void> cancelClaim(String claimId) async {
    await updateClaimStatus(claimId, ClaimStatus.cancelled);
  }

  @override
  Future<ClaimEntity?> getClaimById(String id) async {
    await Future.delayed(const Duration(milliseconds: 200));
    try {
      return _claims.firstWhere((c) => c.id == id);
    } catch (_) {
      return null;
    }
  }
}
