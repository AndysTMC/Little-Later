import { PREVIEW_TYPE } from "../storage/repositories";
import { toBase64 } from "../storage/session";

// A Chrome notification from Little Later. It stays until dismissed unless
// requireInteraction is false; clicking it is handled in background.ts.
export const createChromeNativeNotification = async ({
	id,
	message,
	priority,
	image,
	requireInteraction = true,
}: {
	id: string;
	message: string;
	priority: number;
	// A page preview (JPEG), shown large where the platform supports it.
	image?: Uint8Array;
	requireInteraction?: boolean;
}): Promise<void> => {
	const create = (options: chrome.notifications.NotificationCreateOptions) =>
		new Promise<void>((resolve, reject) => {
			chrome.notifications.create(id, options, () => {
				if (chrome.runtime.lastError) {
					reject(
						new Error(
							chrome.runtime.lastError.message ??
								`Failed to create notification ${id}.`,
						),
					);
					return;
				}
				resolve();
			});
		});
	const basic: chrome.notifications.NotificationCreateOptions = {
		type: "basic",
		iconUrl: chrome.runtime.getURL("images/ll-icon-128.png"),
		title: "Little Later",
		message,
		isClickable: true,
		requireInteraction,
		priority,
	};
	if (!image) {
		await create(basic);
		return;
	}
	try {
		await create({
			...basic,
			type: "image",
			imageUrl: `data:${PREVIEW_TYPE};base64,${toBase64(image)}`,
		});
	} catch (error) {
		// Some platforms refuse image notifications; the reminder itself
		// must still arrive.
		console.warn(`Notification ${id} could not show its image.`, error);
		await create(basic);
	}
};
