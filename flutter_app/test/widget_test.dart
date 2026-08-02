import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ecoeats/main.dart';

void main() {
  testWidgets('EcoEats app smoke test', (WidgetTester tester) async {
    // Verify the app starts without errors
    await tester.pumpWidget(const EcoEatsApp());
    expect(find.byType(MaterialApp), findsNothing);
  });
}
