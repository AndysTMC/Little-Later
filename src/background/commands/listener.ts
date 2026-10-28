import type { CommandResult, Dispatch } from "./registry";

export const COMMAND_MESSAGE = "little/command";

export type CommandMessage = {
	type: typeof COMMAND_MESSAGE;
	name: string;
	input: unknown;
};

const isCommandMessage = (message: unknown): message is CommandMessage =>
	typeof message === "object" &&
	message !== null &&
	(message as CommandMessage).type === COMMAND_MESSAGE &&
	typeof (message as CommandMessage).name === "string";

// Only this extension's own pages may send commands: not other extensions,
// and not content scripts, whose sender URL is the web page (0012).
export const isTrustedSender = (
	sender: chrome.runtime.MessageSender,
	runtimeId: string,
	extensionOrigin: string,
): boolean => {
	if (sender.id !== runtimeId || typeof sender.url !== "string") {
		return false;
	}
	// Scheme and host, not URL.origin: runtimes may serialize the origin of
	// a non-web scheme such as chrome-extension: as "null" for every host.
	try {
		const from = new URL(sender.url);
		const own = new URL(extensionOrigin);
		return (
			own.host !== "" &&
			from.protocol === own.protocol &&
			from.host === own.host
		);
	} catch {
		return false;
	}
};

export const listenForCommands = (dispatch: Dispatch): void => {
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (!isCommandMessage(message)) {
			return false;
		}
		if (
			!isTrustedSender(
				sender,
				chrome.runtime.id,
				chrome.runtime.getURL(""),
			)
		) {
			const refused: CommandResult<never> = {
				ok: false,
				error: { code: "rejected", message: "Untrusted sender." },
			};
			sendResponse(refused);
			return false;
		}
		void dispatch(message.name, message.input).then(sendResponse);
		// Keeps the channel open for the asynchronous reply.
		return true;
	});
};
