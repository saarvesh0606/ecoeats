import 'package:ecoeats/core/constants/app_constants.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

enum NavItem { discover, map, myClaims, profile }

class RecipientBottomNavBar extends StatelessWidget {
  final NavItem selectedItem;
  final ValueChanged<NavItem>? onItemSelected;

  const RecipientBottomNavBar({
    super.key,
    required this.selectedItem,
    this.onItemSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.backgroundCream,
        border: const Border(
          top: BorderSide(color: AppColors.outlineVariant, width: 0.5),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _NavBarItem(
                icon: Icons.search,
                label: 'Discover',
                isSelected: selectedItem == NavItem.discover,
                onTap: () => onItemSelected?.call(NavItem.discover),
              ),
              _NavBarItem(
                icon: Icons.location_on_outlined,
                label: 'Map',
                isSelected: selectedItem == NavItem.map,
                onTap: () => onItemSelected?.call(NavItem.map),
              ),
              _NavBarItem(
                icon: Icons.shopping_bag_outlined,
                iconSelected: Icons.shopping_bag,
                label: 'My Claims',
                isSelected: selectedItem == NavItem.myClaims,
                onTap: () => onItemSelected?.call(NavItem.myClaims),
              ),
              _NavBarItem(
                icon: Icons.person_outline,
                iconSelected: Icons.person,
                label: 'Profile',
                isSelected: selectedItem == NavItem.profile,
                onTap: () => onItemSelected?.call(NavItem.profile),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavBarItem extends StatelessWidget {
  final IconData icon;
  final IconData? iconSelected;
  final String label;
  final bool isSelected;
  final VoidCallback? onTap;

  const _NavBarItem({
    required this.icon,
    this.iconSelected,
    required this.label,
    required this.isSelected,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = isSelected ? AppColors.primaryGreen : AppColors.onSurfaceVariant;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primaryGreen.withOpacity(0.08)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(100),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isSelected ? (iconSelected ?? icon) : icon,
              color: color,
              size: 22,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: GoogleFonts.hankenGrotesk(
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class HostBottomNavBar extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int>? onItemSelected;

  const HostBottomNavBar({
    super.key,
    required this.selectedIndex,
    this.onItemSelected,
  });

  @override
  Widget build(BuildContext context) {
    final items = [
      (Icons.home_outlined, Icons.home, 'Dashboard'),
      (Icons.list_alt_outlined, Icons.list_alt, 'Posts'),
      (Icons.add_circle_outline, Icons.add_circle, 'Create'),
      (Icons.person_outline, Icons.person, 'Profile'),
    ];

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: const Border(
          top: BorderSide(color: AppColors.outlineVariant, width: 0.5),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: items.asMap().entries.map((entry) {
              final i = entry.key;
              final (iconOff, iconOn, label) = entry.value;
              final isSelected = selectedIndex == i;
              return _NavBarItem(
                icon: iconOff,
                iconSelected: iconOn,
                label: label,
                isSelected: isSelected,
                onTap: () => onItemSelected?.call(i),
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}
