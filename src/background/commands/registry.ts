import { EnvelopeError } from "little-shared/utils/envelope";
import { BackupError } from "../../storage/backup";
import { importProfileKeys, type ProfileKeys } from "../../storage/keys";
import { ProfileError } from "../../storage/profiles";
import type { LittleDB } from "../../storage/schema";
import type { SessionStore } from "../../storage/session";
import { StagingError, staging, type Staging } from "../../storage/staging";

// The service worker is the only writer (decision 0012). Each write is a
// command: a name, an input parser and a handler. Pages and AI tools send
// commands; the worker parses, runs them one at a time, and replies.

export type CommandErrorCode =
	"invalid-input" | "unknown-command" | "locked" | "rejected" | "internal";

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
	// Where pages leave binary input for a command (0012, Messaging).
	staging: Staging;
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
	// Read at call time, so a page's clock follows its global `Date`.
	now: () => number = () => Date.now(),
	zone: () => string = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
	stagingStore: Staging = staging,
): CommandContext => ({
	db,
	session,
	now,
	zone,
	staging: stagingStore,
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
	if (
		error instanceof ProfileError ||
		error instanceof EnvelopeError ||
		error instanceof StagingError ||
		error instanceof BackupError
	) {
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

export type DispatchOptions = {
	// Runs the command only if this profile is still the unlocked one when
	// its turn comes. For work that waited on something else first, such as
	// a screenshot, while another profile could be opened.
	profileId?: string;
};

export type Dispatch = (
	name: string,
	input: unknown,
	options?: DispatchOptions,
) => Promise<CommandResult<unknown>>;

// Runs tasks strictly one after another. Everything in the worker that
// writes shares one queue, so a write's reads, crypto and transaction never
// interleave with another's (0012).
export type SerialQueue = <T>(task: () => Promise<T>) => Promise<T>;

export const createSerialQueue = (): SerialQueue => {
	let tail: Promise<unknown> = Promise.resolve();
	return (task) => {
		const result = tail.then(task);
		// A failed task must not stop the ones after it.
		tail = result.catch(() => undefined);
		return result;
	};
};

export const createDispatcher = (
	commands: ReadonlyArray<AnyCommand>,
	ctx: CommandContext,
	queue: SerialQueue = createSerialQueue(),
): Dispatch => {
	const byName = new Map(commands.map((command) => [command.name, command]));
	return (name, input, options) => {
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
			if (
				options?.profileId !== undefined &&
				(await ctx.session.get())?.profileId !== options.profileId
			) {
				return toFailure(
					new CommandError(
						"rejected",
						"The profile changed before this could run.",
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
		return queue(run);
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
