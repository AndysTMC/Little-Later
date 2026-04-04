import {
	LLINK_TYPE,
	LREMINDER_TYPE,
	LTASK_SCHEDULE_TYPE,
} from "little-shared/enums";
import { LReminderTaskLink, LTask, LTaskInsert } from "little-shared/types";
import { db } from "../utils/db";
import { createLink, deleteLink } from "./link";
import { getNextTargetDateFromRecurringInfo } from "little-shared/utils/task";

export const getTask = async (id: number): Promise<LTask | undefined> => {
	return await db.taskTbl.get(id);
};

export const getTasks = async (): Promise<Array<LTask>> => {
	return await db.taskTbl.toArray();
};

export const createTask = async (taskInsert: LTaskInsert): Promise<number> => {
	return await db.taskTbl.add(taskInsert);
};

export const putTask = async (
	taskInsert: LTaskInsert,
	vbmInsertIds: Array<number>,
	vbmDeleteIds: Array<number>,
	reminderType?: LREMINDER_TYPE,
): Promise<number> => {
	taskInsert.id = await db.taskTbl.put(taskInsert);
	for (const vbmID of vbmInsertIds) {
		await createLink({
			type: LLINK_TYPE.TASK_VBM,
			taskId: taskInsert.id,
			vbmId: vbmID,
		});
	}
	for (const vbmID of vbmDeleteIds) {
		await deleteLink({
			type: LLINK_TYPE.TASK_VBM,
			taskId: taskInsert.id,
			vbmId: vbmID,
		});
	}
	const reminderLink = (await db.linkTbl.get({
		taskId: taskInsert.id,
		type: LLINK_TYPE.REMINDER_TASK,
	})) as LReminderTaskLink | undefined;
	switch (taskInsert.schedule.type) {
		case LTASK_SCHEDULE_TYPE.ADHOC:
			if (reminderLink) {
				await deleteLink({
					reminderId: reminderLink.reminderId,
					taskId: taskInsert.id,
					type: LLINK_TYPE.REMINDER_TASK,
				});
			}
			break;
		case LTASK_SCHEDULE_TYPE.DUE:
		case LTASK_SCHEDULE_TYPE.RECURRING:
			if (reminderLink && reminderType === undefined) {
				await deleteLink({
					reminderId: reminderLink.reminderId,
					taskId: taskInsert.id,
					type: LLINK_TYPE.REMINDER_TASK,
				});
			}
			if (reminderType !== undefined) {
				const reminderId = await db.reminderTbl.put({
					id: reminderLink?.reminderId,
					message: `Integrated with task ${taskInsert.id}`,
					type: reminderType,
					targetDate: taskInsert.schedule.deadlineInfo
						? taskInsert.schedule.deadlineInfo.deadlineDate
						: getNextTargetDateFromRecurringInfo(
								taskInsert.schedule.recurringInfo,
							),
				});
				if (reminderLink === undefined) {
					await createLink({
						type: LLINK_TYPE.REMINDER_TASK,
						reminderId,
						taskId: taskInsert.id,
					});
				}
			}
			break;
	}
	return taskInsert.id;
};

export const updateTask = async (
	id: number,
	modifications: Partial<LTask>,
): Promise<void> => {
	await db.taskTbl.update(id, modifications);
};

export const deleteTask = async (id: number): Promise<void> => {
	const task = await db.taskTbl.get(id);
	if (!task) {
		throw new Error(`Task with id ${id} not found`);
	}
	const taskLinks = await db.linkTbl
		.where({
			taskId: task.id,
		})
		.toArray();
	for (const link of taskLinks) {
		await deleteLink(link);
	}
	await db.taskTbl.delete(task.id);
};
