import {
	profileChangePassword,
	profileCreate,
	profileDelete,
	profileLock,
	profileSetAvatar,
	profileUnlock,
	profileUpdate,
} from "./profiles";
import {
	backupImportAbort,
	backupImportBegin,
	backupImportChunk,
} from "./backup";
import { linkCreate, linkDelete } from "./links";
import { noteCreate, noteDelete, noteUpdate } from "./notes";
import { reminderCreate, reminderDelete, reminderUpdate } from "./reminders";
import { saveCapture, saveDelete, saveUpdate } from "./saves";
import { settingsUpdate } from "./settings";
import {
	taskComplete,
	taskCreate,
	taskDelete,
	taskReopen,
	taskUpdate,
} from "./tasks";

// Every command the worker accepts. Pages name them through `Commands`.
export const commands = [
	profileCreate,
	profileUnlock,
	profileLock,
	profileChangePassword,
	profileDelete,
	profileUpdate,
	profileSetAvatar,
	saveCapture,
	saveUpdate,
	saveDelete,
	noteCreate,
	noteUpdate,
	noteDelete,
	taskCreate,
	taskUpdate,
	taskComplete,
	taskReopen,
	taskDelete,
	reminderCreate,
	reminderUpdate,
	reminderDelete,
	linkCreate,
	linkDelete,
	settingsUpdate,
	backupImportBegin,
	backupImportChunk,
	backupImportAbort,
] as const;

type CommandList = typeof commands;

// A field a parser may leave undefined is one a caller may leave out.
type CallerInput<T> = T extends object
	? {
			[K in keyof T as undefined extends T[K] ? K : never]?: T[K];
		} & {
			[K in keyof T as undefined extends T[K] ? never : K]: T[K];
		}
	: T;

export type CommandName = CommandList[number]["name"];
export type Commands = {
	[C in CommandList[number] as C["name"]]: {
		input: CallerInput<ReturnType<C["parse"]>>;
		output: Awaited<ReturnType<C["run"]>>;
	};
};
