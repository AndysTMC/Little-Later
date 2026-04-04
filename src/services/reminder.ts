import { LLINK_TYPE } from "little-shared/enums";
import { LReminder, LReminderInsert } from "little-shared/types";
import { db } from "../utils/db";
import { createLink, deleteLink } from "./link";
import { LDateUtl } from "little-shared/utils/datetime";

export const getReminder = async (
	id: number,
): Promise<LReminder | undefined> => {
	return await db.reminderTbl.get(id);
};

export const getReminders = async (): Promise<Array<LReminder>> => {
	return await db.reminderTbl.toArray();
};

export const deleteReminder = async (id: number): Promise<void> => {
	const reminder = await db.reminderTbl.get(id);
	if (!reminder) {
		throw new Error(`Reminder with id ${id} not found`);
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
	await db.reminderTbl.update(id, modifications);
};
