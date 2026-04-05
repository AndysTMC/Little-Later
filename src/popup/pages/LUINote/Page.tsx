import { motion } from "framer-motion";
import { useParams } from "react-router";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { exitTransitions } from "../../../route-transitions";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useNotes } from "../../hooks/useNotes";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUINoteDetailForm } from "../../components/LUINoteDetailForm/Component";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});
	const notes = useNotes();
	const { id } = useParams();
	const parsedId = Number.parseInt(id ?? "", 10);
	const loading = useLoading([id, notes]);
	const note = notes?.find((item) => item.id === parsedId);

	return (
		<motion.div
			className={`h-full w-full overflow-y-hidden select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} `}
			{...entry}
			{...exit}
		>
			{loading ? (
				<LUILoading />
			) : (
				<motion.div
					className="flex h-full w-full min-h-0 flex-col overflow-y-hidden"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
				>
					<LUIBasicNav navigateTo="/home" />
					{note ? (
						<LUINoteDetailForm note={note} />
					) : (
						<div
							className={`flex h-full w-full items-center justify-center px-6 text-center text-2xl font-extrabold opacity-20 ${
								theme === LTHEME.DARK ? "text-white" : "text-black"
							}`}
						>
							Note not found.
						</div>
					)}
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUINote };
