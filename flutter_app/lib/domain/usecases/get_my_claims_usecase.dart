import 'package:ecoeats/domain/entities/claim.dart';
import 'package:ecoeats/domain/repositories/claim_repository.dart';

class GetMyClaimsUseCase {
  final ClaimRepository _repository;

  const GetMyClaimsUseCase(this._repository);

  Future<List<ClaimEntity>> call({ClaimStatus? status}) async {
    final claims = await _repository.getMyClaims(status: status);
    // Sort by claimedAt descending
    claims.sort((a, b) => b.claimedAt.compareTo(a.claimedAt));
    return claims;
  }
}
