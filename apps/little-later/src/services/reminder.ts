import { LLINK_TYPE } from "little-shared/enums";
import { LReminder, LReminderInsert } from "little-shared/types";
import { db } from "../utils/db";
import { createLink, deleteLink } from "./link";
import { localFetch } from "../utils/littleLocal";
import { LDateUtl } from "little-shared/utils/datetime";

export const getReminder = async (
	id: number,
): Promise<LReminder | undefined> => {
	const response = await localFetch("/reminder/" + id);
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	return await db.reminderTbl.get(id);
};

export const getReminders = async (): Promise<Array<LReminder>> => {
	const response = await localFetch("/reminder");
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	return await db.reminderTbl.toArray();
};

export const deleteReminder = async (id: number): Promise<void> => {
	const response = await localFetch("/reminder/" + id, {
		method: "DELETE",
	});
	if (response.use) {
		return;
	}
	const reminder = await db.reminderTbl.get(id);
	if (!reminder) {
		throw new Error(`Task with id ${id} not found`);
	}
	const reminderLinks = await db.linkTbl
		.where({
			reminderId: id,
		})
		.toArray();
	for (const link of reminderLinks) {
		if (link.type !== LLINK_TYPE.REMINDER_TASK) {
			await deleteLink(link);
		}
	}
	await db.reminderTbl.delete(id);
};

export const createReminder = async (
	reminderInsert: LReminderInsert,
): Promise<number> => {
	const response = await localFetch("/reminder", {
		method: "POST",
		body: JSON.stringify({ reminderInsert }),
		headers: { "Content-Type": "application/json" },
	});
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	return await db.reminderTbl.add({
		...reminderInsert,
		lastNotificationDate: LDateUtl.getNow(),
	});
};

export const putReminder = async (
	reminderInsert: LReminderInsert,
	vbmInsertIds: Array<number>,
	vbmDeleteIds: Array<number>,
): Promise<number> => {
	const response = await localFetch("/reminder/main", {
		method: "POST",
		body: JSON.stringify({ reminderInsert, vbmInsertIds, vbmDeleteIds }),
		headers: { "Content-Type": "application/json" },
	});
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	return await db.transaction(
		"rw",
		[db.reminderTbl, db.linkTbl],
		async () => {
			reminderInsert.id = await db.reminderTbl.put({
				...reminderInsert,
				lastNotificationDate: LDateUtl.getNow(),
			});
			for (const vbmID of vbmInsertIds) {
				await createLink({
					type: LLINK_TYPE.REMINDER_VBM,
					reminderId: reminderInsert.id,
					vbmId: vbmID,
				});
			}
			for (const vbmID of vbmDeleteIds) {
				await deleteLink({
					type: LLINK_TYPE.REMINDER_VBM,
					reminderId: reminderInsert.id,
					vbmId: vbmID,
				});
			}

			return reminderInsert.id;
		},
	);
};

export const updateReminder = async (
	id: number,
	modifications: Partial<LReminder>,
): Promise<void> => {
	const response = await localFetch("/reminder/" + id, {
		method: "PATCH",
		body: JSON.stringify({ modifications }),
		headers: { "Content-Type": "application/json" },
	});
	if (response.use) {
		return;
	}
	await db.reminderTbl.update(id, modifications);
};
