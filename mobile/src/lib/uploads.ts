/**
 * Photo upload to Cloudinary.
 *
 * The image goes straight from the device to Cloudinary — it never passes
 * through our API. Our API only signs the upload (proving the user is a
 * signed-in organizer); Cloudinary rejects anything unsigned. We then keep the
 * returned URL.
 */

import { Platform } from "react-native";
import { api } from "@/lib/api";

interface UploadTicket {
	upload_url: string;
	cloud_name: string;
	api_key: string;
	timestamp: number;
	folder: string;
	signature: string;
}

interface CloudinaryResult {
	secure_url: string;
}

/** Turn a picked-image URI into a value FormData can send, per platform. */
async function fileFromUri(
	uri: string,
): Promise<Blob | { uri: string; name: string; type: string }> {
	if (Platform.OS === "web") {
		// On web the URI is a blob:/data: URL we can fetch back into a Blob.
		const response = await fetch(uri);
		return response.blob();
	}
	// On native, FormData accepts this shape directly.
	const name = uri.split("/").pop() ?? `photo-${Date.now()}.jpg`;
	return { uri, name, type: "image/jpeg" };
}

/**
 * Upload one image and return its hosted URL.
 *
 * The signed parameters must be sent exactly as issued — any extra field would
 * invalidate the signature — plus the file and api_key.
 */
export async function uploadPhoto(uri: string): Promise<string> {
	const ticket = await api.post<UploadTicket>("/uploads/signature");

	const form = new FormData();
	const file = await fileFromUri(uri);
	// FormData's typing differs between web (Blob) and native (object); both are
	// valid at runtime for their platform.
	form.append("file", file as never);
	form.append("api_key", ticket.api_key);
	form.append("timestamp", String(ticket.timestamp));
	form.append("folder", ticket.folder);
	form.append("signature", ticket.signature);

	const response = await fetch(ticket.upload_url, {
		method: "POST",
		body: form,
	});

	if (!response.ok) {
		throw new Error("The photo couldn't be uploaded. Try again.");
	}

	const result = (await response.json()) as CloudinaryResult;
	return result.secure_url;
}
