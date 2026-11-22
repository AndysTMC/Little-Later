import type { ImageRecord } from "../../../storage/repositories";
import { readImages } from "../records";
import { hybridRank } from "./_utils/bm25";
import type { AIOwner } from "../owner";

const toolCall = async (
	owner: AIOwner,
	{ query = "", tag }: { query?: string; tag?: string },
): Promise<Array<ImageRecord>> => {
	let images = await readImages(await owner.keys());
	if (tag && tag.trim() !== "") {
		const normalizedTag = tag.trim().toLowerCase().replace(/^#/, "");
		images = images.filter((image) =>
			(image.tags ?? []).some((t) => t.toLowerCase() === normalizedTag),
		);
	}
	if (query.trim() === "" || images.length === 0) {
		return images;
	}
	return hybridRank(images, query, (image) =>
		[image.title, image.sourceUrl ?? "", ...(image.tags ?? [])].join(" "),
	).map((entry) => entry.item);
};

export { toolCall as searchImagesToolCall };
