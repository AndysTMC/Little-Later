import { db, resetLLDB } from "../utils/db";
import { getLLConfig, updateLLConfig } from "../utils/littleLocal";
import { LUserVault, LUserAvatar, LUserProfile } from "little-shared/types";
import JSZip from "jszip";

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
