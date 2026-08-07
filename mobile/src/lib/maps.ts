import { Linking, Platform } from "react-native";

/**
 * Directions into the phone's own maps app.
 *
 * Only the client knows what it's running on, so the choice of map has to be
 * made here rather than on the server. (The API's `directions_url` claims to be
 * universal, but a maps.google.com link opens Safari on iOS, not Apple Maps.)
 *
 * Two deliberate choices:
 *
 *  - **https links, never the `maps://` or `geo:` schemes.** A custom scheme
 *    needs an `LSApplicationQueriesSchemes` entry before iOS will even admit it
 *    exists, and it dead-ends when the app isn't installed. An https link always
 *    resolves: the OS hands it to the installed app, and falls back to the map
 *    on the web when there isn't one. Nothing to declare in app.json, and no
 *    `canOpenURL` dance.
 *
 *  - **Walking, not driving.** This is surplus food a few minutes away on a
 *    campus you're already standing on. Driving directions to the next building
 *    would be faintly absurd, and the walking route is the one that accounts for
 *    paths cars can't take.
 */
export function directionsUrl(
	lat: number,
	lng: number,
	label?: string | null,
): string {
	const dest = `${lat},${lng}`;

	if (Platform.OS === "ios") {
		// Apple Maps names the destination pin from `q`, so the user sees where
		// they're going rather than a bare pair of coordinates.
		const q = label ? `&q=${encodeURIComponent(label)}` : "";
		return `https://maps.apple.com/?daddr=${dest}&dirflg=w${q}`;
	}

	// Android and web. Google's directions API takes no label — the destination
	// is the coordinates, and precision matters more here than the caption.
	return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=walking`;
}

/**
 * Hand the destination to the maps app. Resolves false if the OS refused it,
 * so a caller can say something rather than appearing to do nothing.
 */
export async function openDirections(
	lat: number,
	lng: number,
	label?: string | null,
): Promise<boolean> {
	try {
		await Linking.openURL(directionsUrl(lat, lng, label));
		return true;
	} catch {
		return false;
	}
}
