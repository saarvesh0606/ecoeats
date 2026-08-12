import { Tabs } from "expo-router";
import { TabIcon, type TabIconName } from "@/components/ui/TabIcon";
import { useAuth } from "@/context/AuthContext";
import { haptics } from "@/lib/haptics";

/**
 * Role-aware tabs. The two roles get different bottom bars — a recipient
 * browses and tracks claims; a host manages posts and creates new ones. Every
 * route file exists for both roles, but `href: null` hides the ones that don't
 * belong to the current role, so nobody can even navigate to them.
 *
 * The host also gets an Activity tab. The recipient Map tab from the mockups is
 * deliberately NOT here. Directions hand off to the phone's own maps app from
 * the listing itself (see lib/maps), and a tab is the wrong shape for that: a
 * tab promises a place inside the app you can go and come back from, whereas
 * this one would throw you into Apple or Google Maps the moment you touched it.
 * The button sits with the address instead, where the question it answers is.
 */

/** `null` in a role column means the tab is hidden for that role. */
const TABS: {
	name: string;
	title: string;
	icon: TabIconName;
	href: { organizer: string | null; recipient: string | null };
}[] = [
	{
		name: "feed",
		title: "Discover",
		icon: "discover",
		href: { organizer: null, recipient: "/feed" },
	},
	{
		name: "claims",
		title: "My Claims",
		icon: "claims",
		href: { organizer: null, recipient: "/claims" },
	},
	{
		name: "posts",
		title: "Dashboard",
		icon: "dashboard",
		href: { organizer: "/posts", recipient: null },
	},
	{
		name: "post",
		title: "Create",
		icon: "create",
		href: { organizer: "/post", recipient: null },
	},
	{
		name: "activity",
		title: "Activity",
		icon: "activity",
		href: { organizer: "/activity", recipient: null },
	},
	{
		name: "profile",
		title: "Profile",
		icon: "profile",
		href: { organizer: "/profile", recipient: "/profile" },
	},
];

export default function TabsLayout() {
	const { profile } = useAuth();
	const role = profile?.role === "organizer" ? "organizer" : "recipient";

	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				tabBarActiveTintColor: "#0C3226",
				tabBarInactiveTintColor: "#9CA3AF",
				tabBarStyle: {
					backgroundColor: "#FFFFFF",
					borderTopColor: "#E5E7EB",
					height: 62,
					paddingBottom: 8,
					paddingTop: 6,
				},
				tabBarLabelStyle: { fontSize: 11, fontFamily: "Inter_500Medium" },
			}}
		>
			{TABS.map((tab) => (
				<Tabs.Screen
					key={tab.name}
					name={tab.name}
					// On the tab press itself, not on focus: the app also moves between
					// tabs on its own (a claim lands the user on /claims), and feedback
					// nobody's finger asked for is just a phone buzzing at you.
					listeners={{ tabPress: () => haptics.select() }}
					options={{
						// Cast: expo-router types href as a known-route union, and these
						// are built from the same route strings the files declare.
						href: tab.href[role] as never,
						title: tab.title,
						tabBarIcon: ({ color, size, focused }) => (
							<TabIcon
								name={tab.icon}
								focused={focused}
								color={color}
								size={size}
							/>
						),
					}}
				/>
			))}
		</Tabs>
	);
}
