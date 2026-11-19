import type { PickRequest } from "../../filePick";

// What a profile photo must be. The screens that show LUIAvatarInput send
// the user to the upload screen with this.
export const AVATAR_REQUEST: PickRequest = {
	title: "Add a photo",
	accepts: "A PNG, JPEG, WebP or GIF image, up to 2 MB",
	types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
	maxBytes: 2 * 1024 * 1024,
	maxFiles: 1,
	pasteHint: "Copy an image, then press Ctrl+V",
};
