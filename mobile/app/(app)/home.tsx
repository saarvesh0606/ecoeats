import { useAuth } from "@/context/AuthContext";
import { OrganizerHome } from "@/screens/OrganizerHome";
import { RecipientFeed } from "@/screens/RecipientFeed";

/**
 * The landing screen, chosen by role. Recipients get the food feed; organizers
 * get the posting side. The two never share an interface — a recipient can't
 * post and an organizer doesn't browse to claim.
 */
export default function Home() {
	const { profile } = useAuth();
	return profile?.role === "organizer" ? <OrganizerHome /> : <RecipientFeed />;
}
