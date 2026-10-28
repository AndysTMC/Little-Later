import {
	profileChangePassword,
	profileCreate,
	profileDelete,
	profileLock,
	profileUnlock,
} from "./profiles";

// Every command the worker accepts. Pages name them through `Commands`.
export const commands = [
	profileCreate,
	profileUnlock,
	profileLock,
	profileChangePassword,
	profileDelete,
] as const;

type CommandList = typeof commands;
export type CommandName = CommandList[number]["name"];
export type Commands = {
	[C in CommandList[number] as C["name"]]: {
		input: ReturnType<C["parse"]>;
		output: Awaited<ReturnType<C["run"]>>;
	};
};
