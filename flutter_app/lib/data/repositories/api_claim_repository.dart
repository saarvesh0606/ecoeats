import 'package:ecoeats/data/api/api_client.dart';
import 'package:ecoeats/data/api/mappers.dart';
import 'package:ecoeats/domain/entities/claim.dart';
import 'package:ecoeats/domain/repositories/claim_repository.dart';

/// Claims, served by the live API.
class ApiClaimRepository implements ClaimRepository {
  ApiClaimRepository(this._client);

  final ApiClient _client;

  List<ClaimEntity> _items(dynamic body) {
    final items = (body as Map?)?['items'] as List? ?? const [];
    return items
        .map((e) => claimFromApi((e as Map).cast<String, dynamic>()))
        .toList();
  }

  @override
  Future<List<ClaimEntity>> getMyClaims({ClaimStatus? status}) async {
    final body = await _client.get('/claims/mine', query: {
      if (status != null) 'status': claimStatusToApi(status),
    });
    return _items(body);
  }

  @override
  Future<List<ClaimEntity>> getPostClaims(String postId) async {
    final body = await _client.get('/listings/$postId/claims');
    return _items(body);
  }

  @override
  Future<ClaimEntity> claimFood({
    required String postId,
    required String userId,
    int servings = 1,
  }) async {
    // `userId` is ignored on purpose: the claim belongs to whoever the token
    // says is calling. Sending an id from the client would either be redundant
    // or a way to claim on someone else's behalf.
    final body = await _client.post('/claims', body: {
      'listing_id': postId,
      'quantity': servings,
    });
    return claimFromApi((body as Map).cast<String, dynamic>());
  }

  @override
  Future<void> updateClaimStatus(String claimId, ClaimStatus status) async {
    // Each transition is its own endpoint, because each does more than set a
    // column — a cancel returns the portions to the listing, a pickup closes
    // the reservation out.
    final path = switch (status) {
      ClaimStatus.pickedUp => '/claims/$claimId/pickup',
      ClaimStatus.expired => '/claims/$claimId/no-show',
      ClaimStatus.cancelled => '/claims/$claimId/cancel',
      _ => null,
    };
    if (path == null) {
      throw ApiException(null, 'Cannot move a claim to ${status.name}.');
    }
    await _client.post(path);
  }

  @override
  Future<void> cancelClaim(String claimId) =>
      _client.post('/claims/$claimId/cancel');

  @override
  Future<ClaimEntity?> getClaimById(String id) async {
    // No single-claim endpoint exists; the list is small and already scoped to
    // this user, so it is cheaper than adding one.
    final claims = await getMyClaims();
    for (final claim in claims) {
      if (claim.id == id) return claim;
    }
    return null;
  }
}
