import 'package:ecoeats/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('starts on the sign-in screen when nobody is signed in',
      (tester) async {
    // ProviderScope is required: EcoEatsApp is a ConsumerWidget, and without an
    // ancestor scope it throws a StateError before rendering anything. The
    // previous version of this test omitted it and had never passed.
    await tester.pumpWidget(const ProviderScope(child: EcoEatsApp()));
    await tester.pumpAndSettle();

    expect(find.byType(MaterialApp), findsOneWidget);
    // The router's guard should have kept an unauthenticated visitor here.
    expect(find.text('Continue'), findsOneWidget);
  });
}
