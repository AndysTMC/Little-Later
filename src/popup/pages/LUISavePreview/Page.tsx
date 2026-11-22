import { LTHEME } from "little-shared/enums";
import { useParams } from "react-router";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { useObjectUrl } from "../../hooks/useObjectUrl";
import { useSaves } from "../../hooks/useRecords";
import { useSavePreview } from "../../hooks/useSavePreview";
import { useTheme } from "../../hooks/useTheme";

// Standalone preview viewer opened in a full tab from the toolbar popup, so
// the image outlives the popup closing and revoking its own blob URL.
const Page = () => {
	const { id } = useParams();
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const saves = useSaves();
	const save = saves?.find((entry) => entry.id === id);
	const preview = useSavePreview(save?.id);
	const url = useObjectUrl(preview);

	return (
		<div
			className={`flex h-full w-full flex-col ${isDark ? "bg-black text-white" : "bg-white text-black"}`}
		>
			<LUIBasicNav navigateTo={save ? `/vbm/${save.id}` : "/home"} />
			{saves === undefined ? (
				<LUILoading />
			) : !save || !url ? (
				<LUIEmptyState title="Preview not available." />
			) : (
				<div
					className={`flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 ${theme}-scrollbar`}
				>
					<img
						src={url}
						alt={save.customName || save.title}
						className={`max-h-full max-w-full rounded-2xl border object-contain shadow-lg ${
							isDark ? "border-neutral-800" : "border-neutral-200"
						}`}
					/>
				</div>
			)}
		</div>
	);
};

export { Page as LUISavePreview };
