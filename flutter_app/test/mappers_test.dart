import 'package:ecoeats/data/api/mappers.dart';
import 'package:ecoeats/domain/entities/claim.dart';
import 'package:ecoeats/domain/entities/food_post.dart';
import 'package:flutter_test/flutter_test.dart';

/// The mapping layer is where the API's vocabulary and this client's are
/// reconciled, and every mistake in it is silent — a wrong status does not
/// throw, it just quietly files a post under the wrong tab. Pure functions, so
/// they are cheap to pin.
void main() {
  group('listing status', () {
    test('claimed means out of stock, not ended', () {
      // "claimed" is the API's word for every portion being spoken for. Reading
      // it as ended would drop live-but-empty posts off the host's Active tab.
      expect(postStatusFromApi('claimed'), PostStatus.outOfStock);
    });

    test('both expired and cancelled collapse to ended', () {
      expect(postStatusFromApi('expired'), PostStatus.ended);
      expect(postStatusFromApi('cancelled'), PostStatus.ended);
    });

    test('an unknown status does not crash the feed', () {
      expect(postStatusFromApi('something-new'), PostStatus.live);
      expect(postStatusFromApi(null), PostStatus.live);
    });

    test('only the two values PATCH accepts are sent back', () {
      expect(postStatusToApi(PostStatus.live), 'active');
      expect(postStatusToApi(PostStatus.outOfStock), 'claimed');
      // Ending a post is POST /cancel, not a status write — returning a value
      // here would produce a 422.
      expect(postStatusToApi(PostStatus.ended), isNull);
    });
  });

  group('claim status', () {
    test('no_show reads as expired to the recipient', () {
      expect(claimStatusFromApi('no_show'), ClaimStatus.expired);
    });

    test('pending is a live reservation', () {
      expect(claimStatusFromApi('pending'), ClaimStatus.reserved);
    });

    test('round-trips through the API spelling', () {
      for (final status in ClaimStatus.values) {
        final wire = claimStatusToApi(status);
        expect(wire, isNotNull, reason: '$status has no API spelling');
      }
    });
  });

  group('dietary tags', () {
    test('gluten-free keeps the hyphen the other client writes', () {
      expect(dietaryToApi(DietaryTag.glutenFree), 'gluten-free');
      expect(dietaryFromApi(['gluten-free']), [DietaryTag.glutenFree]);
    });

    test('an unrecognised tag is dropped, not guessed at', () {
      // The field is free text server-side, so a tag added later must not take
      // the whole feed down with it.
      expect(dietaryFromApi(['vegan', 'invented-tag']), [DietaryTag.vegan]);
    });

    test('null and empty are handled', () {
      expect(dietaryFromApi(null), isEmpty);
      expect(dietaryFromApi([]), isEmpty);
    });
  });

  group('expiry windows', () {
    test('every window the picker offers survives unchanged', () {
      // This is the guarantee the picker fix bought: no silent clamping. If
      // someone adds an option that the API would reject, this fails.
      for (final minutes in kExpiryWindowMinutes) {
        final target = DateTime.now().add(Duration(minutes: minutes));
        expect(
          expiryMinutesFrom(target),
          minutes,
          reason: '$minutes was snapped to something else',
        );
      }
    });

    test('anything longer than an hour is clamped to the maximum', () {
      final tomorrow = DateTime.now().add(const Duration(days: 1));
      expect(expiryMinutesFrom(tomorrow), 60);
    });

    test('a past time falls back to the shortest window', () {
      final past = DateTime.now().subtract(const Duration(hours: 1));
      expect(expiryMinutesFrom(past), 15);
    });

    test('labels read as minutes below an hour and hours above', () {
      expect(expiryWindowLabel(15), '15m');
      expect(expiryWindowLabel(60), '1h');
    });
  });

  group('food post from the API', () {
    Map<String, dynamic> payload() => {
          'id': 'listing-1',
          'title': 'Leftover pizza',
          'description': 'Cheese and pepperoni',
          'allergens': 'Contains gluten and dairy',
          'dietary_tags': ['vegetarian'],
          'quantity_total': 10,
          'quantity_remaining': 4,
          'campus': 'Tempe',
          'building': 'Wrigley Hall',
          'room': '205',
          'placement_note': 'By the front desk',
          'lat': 33.4225,
          'lng': -111.933,
          'expires_at': '2026-08-12T18:00:00Z',
          'created_at': '2026-08-12T17:00:00Z',
          'status': 'active',
          'organizer': {'id': 'host_001', 'name': 'Front Desk', 'rating': 4.5},
          'photo_urls': ['https://example.test/a.jpg'],
          'distance_miles': 0.3,
        };

    test('keeps the allergen warning', () {
      // The entity had no field for this at all, so it was being dropped on the
      // way in — on a food app that is the one field you cannot lose.
      expect(foodPostFromApi(payload()).allergens, 'Contains gluten and dairy');
    });

    test('keeps the coordinate the API computes distance from', () {
      final post = foodPostFromApi(payload());
      expect(post.lat, closeTo(33.4225, 0.0001));
      expect(post.lng, closeTo(-111.933, 0.0001));
    });

    test('folds room into the location name and campus into the address', () {
      final post = foodPostFromApi(payload());
      expect(post.locationName, 'Wrigley Hall, 205');
      expect(post.locationAddress, 'Tempe');
    });

    test('omits the room when there is none', () {
      final post = foodPostFromApi(payload()..['room'] = null);
      expect(post.locationName, 'Wrigley Hall');
    });
  });

  group('claim from the API', () {
    test('reads the title from the nested listing, not a flat field', () {
      // ClaimOut has no `listing_title`; the title lives under `listing`, which
      // is itself nullable.
      final claim = claimFromApi({
        'id': 'claim-1',
        'listing_id': 'listing-1',
        'recipient_id': 'user-1',
        'quantity': 2,
        'status': 'pending',
        'claimed_at': '2026-08-12T17:00:00Z',
        'reservation_expires_at': '2026-08-12T17:15:00Z',
        'listing': {
          'title': 'Leftover pizza',
          'building': 'Wrigley Hall',
          'campus': 'Tempe',
          'photo_urls': ['https://example.test/a.jpg'],
        },
      });
      expect(claim.postTitle, 'Leftover pizza');
      expect(claim.servingsClaimed, 2);
      expect(claim.status, ClaimStatus.reserved);
    });

    test('survives a claim whose listing is missing', () {
      final claim = claimFromApi({
        'id': 'claim-1',
        'listing_id': 'listing-1',
        'recipient_id': 'user-1',
        'quantity': 1,
        'status': 'picked_up',
        'claimed_at': '2026-08-12T17:00:00Z',
        'reservation_expires_at': '2026-08-12T17:15:00Z',
        'listing': null,
      });
      expect(claim.postTitle, 'Food');
      expect(claim.postImageUrl, isNull);
    });
  });
}
