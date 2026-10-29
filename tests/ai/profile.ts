import { littleDB } from "../../src/storage/pageDB";
import { sessionStore } from "../../src/storage/session";
import { deviceZone } from "../../src/utils/dates";
import { send } from "../../src/utils/send";
import { toModelDate } from "../../src/services/ai/toolCalls/_utils/dateFilters";

// AI tools read the page's database and write through `send`, which outside
// production runs the worker's commands in the page. Tests that use them run
// in Node (see tests/storage/profiles.test.ts) against an unlocked,
// passwordless profile.
export const freshProfile = async (): Promise<void> => {
	await sessionStore.clear();
	await Promise.all(littleDB.tables.map((table) => table.clear()));
	await send("profile.create", { name: "Ada", password: null });
};

// A wall-clock time in the device's zone, as the model writes dates.
export const localDate = (dateTime: string): string =>
	toModelDate(
		Temporal.PlainDateTime.from(dateTime).toZonedDateTime(deviceZone())
			.epochMilliseconds,
	);
