// A Chrome notification from Little Later. It stays until dismissed unless
// requireInteraction is false; clicking it is handled in background.ts.
export const createChromeNativeNotification = async ({
	id,
	message,
	priority,
	requireInteraction = true,
}: {
	id: string;
	message: string;
	priority: number;
	requireInteraction?: boolean;
}): Promise<void> => {
	await new Promise<void>((resolve, reject) => {
		chrome.notifications.create(
			id,
			{
				type: "basic",
				iconUrl: chrome.runtime.getURL("images/ll-icon-128.png"),
				title: "Little Later",
				message,
				isClickable: true,
				requireInteraction,
				priority,
			},
			() => {
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
			},
		);
	});
};
