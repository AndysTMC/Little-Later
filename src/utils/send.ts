import type { CommandName, Commands } from "../background/commands";
import {
	COMMAND_MESSAGE,
	type CommandMessage,
} from "../background/commands/listener";
import type {
	CommandErrorCode,
	CommandResult,
	Dispatch,
} from "../background/commands/registry";

// Pages write by sending commands to the service worker (decision 0012).

export class CommandFailure extends Error {
	constructor(
		readonly code: CommandErrorCode,
		message: string,
	) {
		super(message);
		this.name = "CommandFailure";
	}
}

// Outside production there is no service worker: the same handlers run in
// the page against the page's database and session.
let devDispatch: Promise<Dispatch> | null = null;
const getDevDispatch = () => {
	devDispatch ??= (async () => {
		const [{ commands }, registry, pageDB, session] = await Promise.all([
			import("../background/commands"),
			import("../background/commands/registry"),
			import("../storage/pageDB"),
			import("../storage/session"),
		]);
		return registry.createDispatcher(
			commands,
			registry.createCommandContext(
				pageDB.littleDB,
				session.sessionStore,
			),
		);
	})();
	return devDispatch;
};

const transport = async (
	name: string,
	input: unknown,
	options: SendOptions,
): Promise<CommandResult<unknown>> => {
	if (import.meta.env.MODE !== "production") {
		return (await getDevDispatch())(name, input, options);
	}
	const message: CommandMessage = {
		type: COMMAND_MESSAGE,
		name,
		input,
		...(options.profileId ? { profileId: options.profileId } : {}),
		...(options.unlockId ? { unlockId: options.unlockId } : {}),
	};
	return chrome.runtime.sendMessage(message);
};

export type SendOptions = {
	// Runs the command only if this profile is still the unlocked one when
	// its turn comes in the worker's queue.
	profileId?: string;
	// And only if it has not locked since this unlock (UnlockedSession).
	unlockId?: string;
};

export const send = async <N extends CommandName>(
	name: N,
	input: Commands[N]["input"],
	options: SendOptions = {},
): Promise<Commands[N]["output"]> => {
	const result = await transport(name, input, options);
	if (!result.ok) {
		throw new CommandFailure(result.error.code, result.error.message);
	}
	return result.value as Commands[N]["output"];
};
