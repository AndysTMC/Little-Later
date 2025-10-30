import { LNote, LVisualBM, LVisualBMInsert } from "little-shared/types";
import { localFetch } from "../utils/littleLocal";
import { getActiveWebDetails } from "../utils/chrome";
import { db } from "../utils/db";
import { LINT_BOOLEAN, LLINK_TYPE } from "little-shared/enums";
import { LDateUtl } from "little-shared/utils/datetime";
import { createLink, deleteLink } from "./link";
import { updateNote } from "./note";
import { getUserSettings } from "./settings";

export const saveActiveWebPage = async (): Promise<number> => {
	const { url, title } = await getActiveWebDetails();
	if (!url) {
		throw new Error("No active page URL found");
	}
	if (!title) {
		throw new Error("No active page title found");
	}
	await updateVisualBM(url, {
		url: url,
		title: title,
		isSaved: LINT_BOOLEAN.TRUE,
	});
	const visualBM = await getVisualBMByUrl(url);
	return visualBM?.id ?? -1;
};

export const putVisualBM = async (
	visualBMInsert: LVisualBMInsert,
	noteCreates: LNote[],
	noteUpdates: LNote[],
	noteDeletes: LNote[],
	reminderDeleteIds: Array<number>,
	taskDeleteIds: Array<number>,
): Promise<number> => {
	const response = await localFetch("/visualBM/main", {
		method: "POST",
		body: JSON.stringify({
			visualBMInsert,
			noteCreates,
			noteUpdates,
			noteDeletes,
			reminderDeleteIds,
			taskDeleteIds,
		}),
		headers: { "Content-Type": "application/json" },
	});
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	visualBMInsert.id = await db.visualBMTbl.put({
		...visualBMInsert,
		customName: visualBMInsert.customName ?? visualBMInsert.title,
		hasBrowsed: LINT_BOOLEAN.TRUE,
		lastBrowseDate: LDateUtl.getNow(),
		isSaved: visualBMInsert.isSaved ?? LINT_BOOLEAN.FALSE,
	});
	for (const note of noteCreates) {
		const noteId = await db.noteTbl.add({
			content: note.content,
		});
		await createLink({
			noteId: noteId,
			type: LLINK_TYPE.NOTE_VBM,
			vbmId: visualBMInsert.id,
		});
	}
	for (const note of noteUpdates) {
		await updateNote(note.id, note);
	}
	for (const note of noteDeletes) {
		await deleteLink({
			noteId: note.id,
			type: LLINK_TYPE.NOTE_VBM,
			vbmId: visualBMInsert.id,
		});
	}
	for (const reminderId of reminderDeleteIds) {
		await deleteLink({
			type: LLINK_TYPE.REMINDER_VBM,
			vbmId: visualBMInsert.id,
			reminderId,
		});
	}
	for (const reminderId of taskDeleteIds) {
		await deleteLink({
			type: LLINK_TYPE.TASK_VBM,
			vbmId: visualBMInsert.id,
			taskId: reminderId,
		});
	}
	return visualBMInsert.id;
};

export const updateVisualBM = async (
	url: string,
	modifications: Partial<LVisualBM>,
): Promise<number> => {
	const urlSearchParams = new URLSearchParams({ url });
	const response = await localFetch(
		"/visualBM?" + urlSearchParams.toString(),
		{
			method: "PATCH",
			body: JSON.stringify({ modifications }),
			headers: { "Content-Type": "application/json" },
		},
	);
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	const urlObj = new URL(url);
	const visualBM = await db.visualBMTbl.get({ url });
	if (!urlObj) {
		throw new Error("Invalid URL");
	}
	if (visualBM === undefined) {
		if (!modifications.title) {
			throw new Error("Title is required for new VisualBM");
		}
		const urlObj = new URL(url);
		const userSettings = await getUserSettings();
		const totalVBMCount = await db.visualBMTbl
			.where("isSaved")
			.equals(LINT_BOOLEAN.FALSE)
			.count();
		const sameOriginVBMCount = await db.visualBMTbl
			.where("url")
			.startsWith(urlObj.origin)
			.and((vbm) => vbm.isSaved === LINT_BOOLEAN.FALSE)
			.count();
		if (totalVBMCount >= userSettings.misc.VBMLimit) {
			await db.visualBMTbl
				.orderBy("lastBrowseDate")
				.and((vbm) => vbm.isSaved === LINT_BOOLEAN.FALSE)
				.limit(totalVBMCount - userSettings.misc.VBMLimit + 1)
				.delete();
		}
		if (sameOriginVBMCount >= userSettings.misc.VBMSameOriginLimit) {
			await db.visualBMTbl
				.orderBy("lastBrowseDate")
				.and((vbm) => vbm.url.startsWith(urlObj.origin))
				.and((vbm) => vbm.isSaved === LINT_BOOLEAN.FALSE)
				.limit(
					sameOriginVBMCount -
						userSettings.misc.VBMSameOriginLimit +
						1,
				)
				.delete();
		}
		const newVbmId = await db.visualBMTbl.add({
			url: url,
			title: modifications.title,
			customName: modifications.title,
			hasBrowsed: LINT_BOOLEAN.TRUE,
			lastBrowseDate: LDateUtl.getNow(),
			isSaved: LINT_BOOLEAN.FALSE,
		});
		return newVbmId;
	}
	const isSavedFinal = modifications.isSaved ?? visualBM.isSaved;
	const hasBrowsedFinal = modifications.hasBrowsed ?? visualBM.hasBrowsed;
	if (
		visualBM.isSaved === LINT_BOOLEAN.TRUE &&
		modifications.isSaved === LINT_BOOLEAN.FALSE
	) {
		const vbmLinks = await db.linkTbl
			.where({
				vbmId: visualBM.id,
			})
			.toArray();
		for (const link of vbmLinks) {
			await deleteLink(link);
		}
	}
	if (modifications.hasBrowsed === LINT_BOOLEAN.TRUE) {
		modifications.lastBrowseDate = LDateUtl.getNow();
	}
	if (
		hasBrowsedFinal === LINT_BOOLEAN.FALSE &&
		isSavedFinal === LINT_BOOLEAN.FALSE
	) {
		await db.vbmPreviewTbl.delete(visualBM.id);
		await db.visualBMTbl.delete(visualBM.id);
		return visualBM.id;
	}

	await db.visualBMTbl.update(visualBM.id, modifications);
	return visualBM.id;
};

export const getVisualBM = async (
	id: number,
): Promise<LVisualBM | undefined> => {
	const response = await localFetch("/visualBM/" + id);
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	return await db.visualBMTbl.get(id);
};

export const getVisualBMByUrl = async (
	url: string,
): Promise<LVisualBM | undefined> => {
	const urlSearchParams = new URLSearchParams({ url });
	const response = await localFetch(
		"/visualBM/byUrl?" + urlSearchParams.toString(),
	);
	if (response.use) {
		const result = await response.response?.json();
		return result;
	}
	return await db.visualBMTbl.where("url").equals(url).first();
};

export const updateVisualBMPreview = async (
	url: string,
	preview: Blob,
): Promise<void> => {
	const urlSearchParams = new URLSearchParams({ vbmUrl: url });
	const response = await localFetch(
		"/visualBM/preview?" + urlSearchParams.toString(),
		{
			method: "PATCH",
			body: preview,
		},
	);
	if (response.use) {
		return;
	}
	const visualBM = await getVisualBMByUrl(url);
	if (visualBM === undefined) {
		throw new Error("LVisualBM not found for preview update.");
	}
	await db.vbmPreviewTbl.put({
		vbmId: visualBM.id,
		blob: preview,
	});
};

export const getVisualBMs = async (): Promise<LVisualBM[]> => {
	const response = await localFetch("/visualBM");
	if (response.use) {
		const result = await response.response?.json();
		return result ?? [];
	}
	return await db.visualBMTbl.toArray();
};

export const getVisualBMPreview = async (
	vbmId: number,
): Promise<Blob | undefined> => {
	const response = await localFetch("/visualBM/preview/" + vbmId);
	if (response.use) {
		const result = await response.response?.blob();
		return result;
	}
	const preview = await db.vbmPreviewTbl.get(vbmId);
	return preview?.blob;
};
