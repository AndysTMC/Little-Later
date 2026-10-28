import { motion } from "framer-motion";
import { useParams } from "react-router";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { exitTransitions } from "../../../route-transitions";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useNotes } from "../../hooks/useRecords";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUINoteDetailForm } from "../../components/LUINoteDetailForm/Component";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});
	const notes = useNotes();
	const { id } = useParams();
	const loading = useLoading([id, notes]);
	const note =
		id === "new"
			? { id: null, content: "" }
			: notes?.find((item) => item.id === id);

	return (
		<motion.div
			className={`h-full w-full overflow-y-hidden ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} `}
			{...entry}
			{...exit}
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
						<LUINoteDetailForm note={note} />
					) : (
						<LUIEmptyState title="Note not found." />
					)}
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUINote };
