import { motion } from "framer-motion";
import { useParams } from "react-router";
import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useLinks, useNotes, useSaves } from "../../hooks/useRecords";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUINoteDetailForm } from "../../components/LUINoteDetailForm/Component";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";

import { useMemo } from "react";

const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const notes = useNotes();
	const links = useLinks();
	const pages = useSaves();
	const { id } = useParams();
	const loading = useLoading([id, notes]);
	const note =
		id === "new"
			? { id: null, content: "" }
			: notes?.find((item) => item.id === id);

	const savedPages = useMemo(
		() => (pages ?? []).filter((page) => page.saved),
		[pages],
	);

	return (
		<motion.div
			className={`h-full w-full overflow-y-hidden ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} `}
			{...pageMotion}
		>
			{loading ? (
				<LUILoading />
			) : (
				<motion.div
					className="flex h-full min-h-0 w-full flex-col overflow-y-hidden"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
				>
					<LUIBasicNav navigateTo="/home" />
					{note ? (
						<LUINoteDetailForm
							note={note}
							links={links}
							saves={savedPages}
						/>
					) : (
						<LUIEmptyState title="Note not found." />
					)}
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUINote };
