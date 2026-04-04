import { db, resetLLDB } from "../utils/db";
import { getLLConfig, updateLLConfig } from "../utils/littleLocal";
import {
	LUserVault,
	LUserAvatar,
	LUserProfile,
	LUserSettings,
} from "little-shared/types";
import { LINT_BOOLEAN } from "little-shared/enums";
import JSZip from "jszip";
import { getUserSettings } from "./settings";

type CurrentProfileSnapshot = {
	currentUserId: number;
	userSettings: LUserSettings;
	tables: {
		linkTbl: unknown[];
		noteTbl: unknown[];
		reminderTbl: unknown[];
		taskTbl: unknown[];
		visualBMTbl: unknown[];
		vbmPreviewIds: number[];
	};
};

export const switchToLittleLocal = async () => {
	const llConfig = await getLLConfig();
	const userProfiles = await db.userProfileTbl.toArray();
	const userVaults = await db.userVaultTbl.toArray();
	const userAvatars = await db.userAvatarTbl.toArray();

	const formData = new FormData();
	formData.append("userProfiles", JSON.stringify(userProfiles));

	userVaults.forEach((vault: LUserVault) => {
		if (vault.data) {
			const vaultBlob =
				vault.data instanceof Blob
					? vault.data
					: new Blob([vault.data], {
							type: "application/octet-stream",
						});

			formData.append(
				`vault_${vault.userId}`,
				vaultBlob,
				`vault_${vault.userId}.bin`,
			);
		}
	});

	userAvatars.forEach((avatar: LUserAvatar) => {
		if (avatar.blob) {
			const avatarBlob =
				avatar.blob instanceof Blob
					? avatar.blob
					: new Blob([avatar.blob], { type: "image/png" });

			formData.append(
				`avatar_${avatar.userId}`,
				avatarBlob,
				`avatar_${avatar.userId}.png`,
			);
		}
	});

	const currentUserProfile = await db.userProfileTbl
		.where("isCurrent")
		.equals(LINT_BOOLEAN.TRUE)
		.first();

	if (currentUserProfile) {
		const [linkTbl, noteTbl, reminderTbl, taskTbl, visualBMTbl, vbmPreviewTbl] =
			await Promise.all([
				db.linkTbl.toArray(),
				db.noteTbl.toArray(),
				db.reminderTbl.toArray(),
				db.taskTbl.toArray(),
				db.visualBMTbl.toArray(),
				db.vbmPreviewTbl.toArray(),
			]);
		const userSettings = await getUserSettings();
		const snapshotZip = new JSZip();
		const metadata: CurrentProfileSnapshot = {
			currentUserId: currentUserProfile.userId,
			userSettings,
			tables: {
				linkTbl,
				noteTbl,
				reminderTbl,
				taskTbl,
				visualBMTbl,
				vbmPreviewIds: vbmPreviewTbl.map((preview) => preview.vbmId),
			},
		};
		snapshotZip.file("metadata.json", JSON.stringify(metadata));
		for (const preview of vbmPreviewTbl) {
			snapshotZip.file(`previews/${preview.vbmId}.bin`, preview.blob);
		}
		const snapshotBytes = await snapshotZip.generateAsync({
			type: "uint8array",
		});
		const snapshotArrayBuffer = new ArrayBuffer(snapshotBytes.byteLength);
		new Uint8Array(snapshotArrayBuffer).set(snapshotBytes);
		formData.append(
			"currentSnapshot",
			new Blob([snapshotArrayBuffer], {
				type: "application/octet-stream",
			}),
			"currentSnapshot.bin",
		);
	}

	const response = await fetch(
		`http://localhost:${llConfig.port}/api/switch/toLittleLocal`,
		{
			method: "POST",
			body: formData,
		},
	);

	if (!response.ok) {
		throw new Error(
			`Failed to switch to Little Local: ${response.statusText}`,
		);
	}

	return { success: true };
};

export const switchToChrome = async (): Promise<{ success: boolean }> => {
	try {
		await resetLLDB();

		const llConfig = await getLLConfig();

		const response = await fetch(
			`http://localhost:${llConfig.port}/api/switch/toChrome`,
			{
				method: "POST",
			},
		);

		if (!response.ok) throw new Error("Failed to fetch ZIP from server");

		const arrayBuffer = await response.arrayBuffer();
		const zip = await JSZip.loadAsync(arrayBuffer);

		const profilesText = await zip.file("userProfiles.json")?.async("text");
		const userProfiles: LUserProfile[] = profilesText
			? JSON.parse(profilesText)
			: [];

		const userAvatars: LUserAvatar[] = [];
		const avatarFiles = Object.keys(zip.files).filter((f) =>
			f.startsWith("avatars/"),
		);

		for (const filename of avatarFiles) {
			const userId = filename.match(/avatar_(\d+)\.png$/)?.[1];
			if (!userId) continue;

			const blob = await zip.file(filename)!.async("blob");
			userAvatars.push({
				userId: Number(userId),
				blob,
			});
		}

		const userVaults: LUserVault[] = [];
		const vaultFiles = Object.keys(zip.files).filter((f) =>
			f.startsWith("vaults/"),
		);

		for (const filename of vaultFiles) {
			const userId = filename.match(/vault_(\d+)\.bin$/)?.[1];
			if (!userId) continue;

			const blob = await zip.file(filename)!.async("blob");
			userVaults.push({
				userId: Number(userId),
				data: blob,
			});
		}

		await db.userProfileTbl.bulkAdd(userProfiles);
		await db.userAvatarTbl.bulkAdd(userAvatars);
		await db.userVaultTbl.bulkAdd(userVaults);
		await updateLLConfig({ isEnabled: false });

		return { success: true };
	} catch (err) {
		console.error("❌ switchToChrome failed:", err);
		return { success: false };
	}
};
