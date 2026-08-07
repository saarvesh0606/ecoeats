import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";

export interface Coords {
	lat: number;
	lng: number;
}

/**
 *  - `idle`        nothing asked for yet
 *  - `locating`    permission dialog open, or waiting on a fix
 *  - `granted`     we have coordinates
 *  - `denied`      the user said no
 *  - `unavailable` the device couldn't produce a fix (no GPS, timed out,
 *                  a browser refusing on an insecure origin)
 */
export type LocationStatus =
	| "idle"
	| "locating"
	| "granted"
	| "denied"
	| "unavailable";

/**
 * The device's position, asked for politely and never insisted on.
 *
 * The governing rule: **location is an enhancement, never a gate.** A denied
 * permission has to leave the app fully usable — the feed still lists food, it
 * just can't say how far away it is, and a post still goes up, pinned to its
 * campus rather than to a doorway. Nothing here throws, and every failure
 * resolves to `null` rather than propagating, so no caller has to guard.
 *
 * `Accuracy.Balanced` (~100m) by default: enough to say "0.3 mi away", far
 * quicker than a GPS-grade fix and much easier on the battery. Posting asks for
 * better, because that coordinate is where people will actually walk to.
 */
export function useDeviceLocation({
	auto = false,
	accuracy = Location.Accuracy.Balanced,
}: { auto?: boolean; accuracy?: Location.Accuracy } = {}) {
	const [coords, setCoords] = useState<Coords | null>(null);
	const [status, setStatus] = useState<LocationStatus>("idle");
	/** A second press while the OS dialog is open must not open a second one. */
	const inflight = useRef(false);

	const request = useCallback(async (): Promise<Coords | null> => {
		if (inflight.current) return null;
		inflight.current = true;
		setStatus("locating");
		try {
			const { granted } = await Location.requestForegroundPermissionsAsync();
			if (!granted) {
				setStatus("denied");
				return null;
			}
			const fix = await Location.getCurrentPositionAsync({ accuracy });
			const next = { lat: fix.coords.latitude, lng: fix.coords.longitude };
			setCoords(next);
			setStatus("granted");
			return next;
		} catch {
			// A permission that resolves but a fix that never arrives is common
			// indoors, and on the web on any non-HTTPS origin.
			setStatus("unavailable");
			return null;
		} finally {
			inflight.current = false;
		}
	}, [accuracy]);

	useEffect(() => {
		if (auto) void request();
	}, [auto, request]);

	return { coords, status, request };
}
