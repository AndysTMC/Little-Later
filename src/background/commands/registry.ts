import { EnvelopeError } from "little-shared/utils/envelope";
import { importProfileKeys, type ProfileKeys } from "../../storage/keys";
import { ProfileError } from "../../storage/profiles";
import type { LittleDB } from "../../storage/schema";
import type { SessionStore } from "../../storage/session";

// The service worker is the only writer (decision 0012). Each write is a
// command: a name, an input parser and a handler. Pages and AI tools send
// commands; the worker parses, runs them one at a time, and replies.

export type CommandErrorCode =
	| "invalid-input"
	| "unknown-command"
	| "locked"
	| "rejected"
	| "internal";

export class CommandError extends Error {
	constructor(
		readonly code: CommandErrorCode,
		message: string,
	) {
		super(message);
		this.name = "CommandError";
	}
}

export type CommandContext = {
	db: LittleDB;
	session: SessionStore;
	now: () => number;
	// The device's current IANA time zone, for floating schedules (0011).
	zone: () => string;
	// The unlocked profile's keys; fails with "locked" when none is unlocked.
	keys: () => Promise<ProfileKeys>;
};

export type Command<N extends string, I, O> = {
	name: N;
	// Turns untrusted message input into a typed value, or throws
	// CommandError("invalid-input").
	parse: (input: unknown) => I;
	run: (ctx: CommandContext, input: I) => Promise<O>;
};

export const defineCommand = <N extends string, I, O>(
	command: Command<N, I, O>,
) => command;

// Messages carry JSON only, so results and errors are plain objects.
export type CommandResult<O> =
	| { ok: true; value: O }
	| { ok: false; error: { code: CommandErrorCode; message: string } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCommand = Command<string, any, any>;

export const createCommandContext = (
	db: LittleDB,
	session: SessionStore,
	now: () => number = Date.now,
	zone: () => string = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): CommandContext => ({
	db,
	session,
	now,
	zone,
	keys: async () => {
		const unlocked = await session.get();
		if (!unlocked) {
			throw new CommandError("locked", "No profile is unlocked.");
		}
		return importProfileKeys(unlocked);
	},
});

const toFailure = (
	error: unknown,
): Extract<CommandResult<never>, { ok: false }> => {
	if (error instanceof CommandError) {
		return {
			ok: false,
			error: { code: error.code, message: error.message },
		};
	}
	// Expected refusals from the storage layer: a wrong password, a bad
	// profile state. Anything else is a bug and is reported as internal.
	if (error instanceof ProfileError || error instanceof EnvelopeError) {
		return {
			ok: false,
			error: { code: "rejected", message: error.message },
		};
	}
	console.error("Command failed:", error);
	return {
		ok: false,
		error: { code: "internal", message: "Something went wrong." },
	};
};

export type Dispatch = (
	name: string,
	input: unknown,
) => Promise<CommandResult<unknown>>;

// Runs commands strictly one after another, so a command's reads, crypto
// and transaction never interleave with another command's (0012).
export const createDispatcher = (
	commands: ReadonlyArray<AnyCommand>,
	ctx: CommandContext,
): Dispatch => {
	const byName = new Map(commands.map((command) => [command.name, command]));
	let queue: Promise<unknown> = Promise.resolve();
	return (name, input) => {
		const run = async (): Promise<CommandResult<unknown>> => {
			const command = byName.get(name);
			if (!command) {
				return toFailure(
					new CommandError(
						"unknown-command",
						`Unknown command ${name}.`,
					),
				);
			}
			try {
				return {
					ok: true,
					value: await command.run(ctx, command.parse(input)),
				};
			} catch (error) {
				return toFailure(error);
			}
		};
		const result = queue.then(run);
		queue = result;
		return result;
	};
};

// Small parsers for command inputs; no schema library.
export const fail = (message: string): never => {
	throw new CommandError("invalid-input", message);
};

export const asRecord = (input: unknown): Record<string, unknown> =>
	typeof input === "object" && input !== null && !Array.isArray(input)
		? (input as Record<string, unknown>)
		: fail("Expected an object.");

export const asString = (value: unknown, field: string): string =>
	typeof value === "string" ? value : fail(`${field} must be a string.`);

export const asNullableString = (
	value: unknown,
	field: string,
): string | null =>
	value === null || typeof value === "string"
		? value
		: fail(`${field} must be a string or null.`);
