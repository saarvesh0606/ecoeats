import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useAuth } from "@/context/AuthContext";

/**
 * Role-aware tabs. The two roles get different bottom bars — a recipient
 * browses and tracks claims; a host manages posts and creates new ones. Every
 * route file exists for both roles, but `href: null` hides the ones that don't
 * belong to the current role, so nobody can even navigate to them.
 *
 * The host also gets an Activity tab. The recipient Map tab from the mockups is
 * deferred: react-native-maps is native and ships with the device build.
 */
export default function TabsLayout() {
	const { profile } = useAuth();
	const isOrganizer = profile?.role === "organizer";

	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				tabBarActiveTintColor: "#1B4332",
				tabBarInactiveTintColor: "#9CA3AF",
				tabBarStyle: {
					backgroundColor: "#FFFFFF",
					borderTopColor: "#E5E7EB",
					height: 62,
					paddingBottom: 8,
					paddingTop: 6,
				},
				tabBarLabelStyle: { fontSize: 11, fontFamily: "DMSans_500Medium" },
			}}
		>
			<Tabs.Screen
				name="feed"
				options={{
					href: isOrganizer ? null : "/feed",
					title: "Discover",
					tabBarIcon: ({ color, size, focused }) => (
						<Ionicons
							name={focused ? "compass" : "compass-outline"}
							size={size}
							color={color}
						/>
					),
				}}
			/>
			<Tabs.Screen
				name="claims"
				options={{
					href: isOrganizer ? null : "/claims",
					title: "My Claims",
					tabBarIcon: ({ color, size, focused }) => (
						<Ionicons
							name={focused ? "receipt" : "receipt-outline"}
							size={size}
							color={color}
						/>
					),
				}}
			/>
			<Tabs.Screen
				name="posts"
				options={{
					href: isOrganizer ? "/posts" : null,
					title: "Dashboard",
					tabBarIcon: ({ color, size, focused }) => (
						<Ionicons
							name={focused ? "grid" : "grid-outline"}
							size={size}
							color={color}
						/>
					),
				}}
			/>
			<Tabs.Screen
				name="post"
				options={{
					href: isOrganizer ? "/post" : null,
					title: "Create",
					tabBarIcon: ({ color, size, focused }) => (
						<Ionicons
							name={focused ? "add-circle" : "add-circle-outline"}
							size={size}
							color={color}
						/>
					),
				}}
			/>
			<Tabs.Screen
				name="activity"
				options={{
					href: isOrganizer ? "/activity" : null,
					title: "Activity",
					tabBarIcon: ({ color, size, focused }) => (
						<Ionicons
							name={focused ? "notifications" : "notifications-outline"}
							size={size}
							color={color}
						/>
					),
				}}
			/>
			<Tabs.Screen
				name="profile"
				options={{
					title: "Profile",
					tabBarIcon: ({ color, size, focused }) => (
						<Ionicons
							name={focused ? "person" : "person-outline"}
							size={size}
							color={color}
						/>
					),
				}}
			/>
		</Tabs>
	);
}
