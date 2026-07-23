import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useAuth } from "@/context/AuthContext";

/**
 * Role-aware tabs. The two roles get different bottom bars — a recipient
 * browses and tracks claims; an organizer manages posts and creates new ones.
 * Every route file exists for both roles, but `href: null` hides the ones that
 * don't belong to the current role, so nobody can even navigate to them.
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
					height: 60,
					paddingBottom: 8,
					paddingTop: 6,
				},
				tabBarLabelStyle: { fontSize: 11 },
			}}
		>
			<Tabs.Screen
				name="feed"
				options={{
					href: isOrganizer ? null : "/feed",
					title: "Feed",
					tabBarIcon: ({ color, size }) => (
						<Ionicons name="fast-food-outline" size={size} color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="claims"
				options={{
					href: isOrganizer ? null : "/claims",
					title: "My claims",
					tabBarIcon: ({ color, size }) => (
						<Ionicons name="receipt-outline" size={size} color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="posts"
				options={{
					href: isOrganizer ? "/posts" : null,
					title: "My posts",
					tabBarIcon: ({ color, size }) => (
						<Ionicons name="list-outline" size={size} color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="post"
				options={{
					href: isOrganizer ? "/post" : null,
					title: "Post",
					tabBarIcon: ({ color, size }) => (
						<Ionicons name="add-circle-outline" size={size} color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="profile"
				options={{
					title: "Profile",
					tabBarIcon: ({ color, size }) => (
						<Ionicons name="person-outline" size={size} color={color} />
					),
				}}
			/>
		</Tabs>
	);
}
