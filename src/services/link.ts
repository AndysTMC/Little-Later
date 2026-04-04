import { LLINK_TYPE } from "little-shared/enums";
import { LLink, LLinkInsert } from "little-shared/types";
import { db } from "../utils/db";
import { deleteReminder } from "./reminder";
export const createLink = async (linkInsert: LLinkInsert): Promise<number> => {
	switch (linkInsert.type) {
		case LLINK_TYPE.NOTE_VBM: {
			if (
				linkInsert.noteId === undefined ||
				linkInsert.vbmId === undefined
			) {
				throw new Error(
					"Note-Save link must have both noteId and vbmId defined",
				);
			} else if (
				linkInsert.reminderId !== undefined ||
				linkInsert.taskId !== undefined
			) {
				throw new Error(
					"Note-Save link cannot have reminderId and taskId defined",
				);
			}
			break;
		}

		case LLINK_TYPE.REMINDER_VBM: {
			if (
				linkInsert.reminderId === undefined ||
				linkInsert.vbmId === undefined
			) {
				throw new Error(
					"Reminder-Save link must have both reminderId and vbmId defined",
				);
			} else if (
				linkInsert.noteId !== undefined ||
				linkInsert.taskId !== undefined
			) {
				throw new Error(
					"Reminder-Save link cannot have noteId and taskId defined",
				);
			}
			break;
		}

		case LLINK_TYPE.REMINDER_TASK: {
			if (
				linkInsert.reminderId === undefined ||
				linkInsert.taskId === undefined
			) {
				throw new Error(
					"Reminder-Task link must have both reminderId and taskId defined",
				);
			} else if (
				linkInsert.noteId !== undefined ||
				linkInsert.vbmId !== undefined
			) {
				throw new Error(
					"Reminder-Task link cannot have noteId and vbmId defined",
				);
			}
			break;
		}

		case LLINK_TYPE.TASK_VBM: {
			if (
				linkInsert.taskId === undefined ||
				linkInsert.vbmId === undefined
			) {
				throw new Error(
					"Save-Task link must have both vbmId and taskId defined",
				);
			} else if (
				linkInsert.noteId !== undefined ||
				linkInsert.reminderId !== undefined
			) {
				throw new Error(
					"Save-Task link cannot have noteId and reminderId defined",
				);
			}
			break;
		}
	}

	linkInsert.noteId = linkInsert.noteId ?? null;
	linkInsert.reminderId = linkInsert.reminderId ?? null;
	linkInsert.vbmId = linkInsert.vbmId ?? null;
	linkInsert.taskId = linkInsert.taskId ?? null;

	const id = await db.linkTbl.add(linkInsert);
	return id;
};

export const deleteLink = async (linkInsert: LLinkInsert): Promise<void> => {
	delete linkInsert.id;
	switch (linkInsert.type) {
		case LLINK_TYPE.NOTE_VBM:
			delete linkInsert.reminderId;
			delete linkInsert.taskId;
			if (linkInsert.noteId !== undefined && linkInsert.noteId !== null) {
				const noteId = linkInsert.noteId;
				await db.linkTbl.where(linkInsert).delete();
				await db.linkTbl.where("noteId").equals(noteId).delete();
				await db.noteTbl.delete(noteId);
				return;
			}
			break;
		case LLINK_TYPE.REMINDER_TASK:
			delete linkInsert.noteId;
			delete linkInsert.vbmId;
			await deleteReminder(linkInsert.reminderId);
			break;
		case LLINK_TYPE.REMINDER_VBM:
			delete linkInsert.noteId;
			delete linkInsert.taskId;
			break;
		case LLINK_TYPE.TASK_VBM:
			delete linkInsert.noteId;
			delete linkInsert.reminderId;
			break;
		default:
			break;
	}
	await db.linkTbl.where(linkInsert).delete();
};

export const getLinks = async (): Promise<Array<LLink>> => {
	return await db.linkTbl.toArray();
};
