import {
	profileChangePassword,
	profileCreate,
	profileDelete,
	profileLock,
	profileUnlock,
} from "./profiles";
import { noteCreate, noteDelete, noteUpdate } from "./notes";
import { saveCapture, saveDelete, saveUpdate } from "./saves";

// Every command the worker accepts. Pages name them through `Commands`.
export const commands = [
	profileCreate,
	profileUnlock,
	profileLock,
	profileChangePassword,
	profileDelete,
	saveCapture,
	saveUpdate,
	saveDelete,
	noteCreate,
	noteUpdate,
	noteDelete,
] as const;

type CommandList = typeof commands;
export type CommandName = CommandList[number]["name"];
export type Commands = {
	[C in CommandList[number] as C["name"]]: {
		input: ReturnType<C["parse"]>;
		output: Awaited<ReturnType<C["run"]>>;
	};
};
