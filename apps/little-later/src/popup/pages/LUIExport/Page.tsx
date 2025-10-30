import { useLittleTransition } from "../../hooks/useLittleTransition";
import { useTheme } from "../../hooks/useTheme";
import { exitTransitions } from "../../../route-transitions";
import { LEXPORT_TYPE, LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useState } from "react";
import {
	exportDataImportable,
	exportDataReadable,
} from "../../../services/dataExchange";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISelectT2 } from "../../components/LUISelectT2/Component";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});
	const ExportTypes = Object.values(LEXPORT_TYPE);
	const [exportType, setExportType] = useState<LEXPORT_TYPE>(
		LEXPORT_TYPE.IMPORTABLE,
	);
	const handleExport = async () => {
		if (exportType === LEXPORT_TYPE.IMPORTABLE) {
			await exportDataImportable();
		} else {
			await exportDataReadable();
		}
	};
	return (
		<motion.div
			className={`flex h-full w-full flex-col select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-hidden`}
			{...entry}
			{...exit}
		>
			<LUIBasicNav navigateTo="/settings" />
			<LUISettingsLayout pageName="Export">
				<div className={`relative h-max w-full`}>
					<div
						className={`relative z-40 flex h-max w-full items-center justify-between py-2`}
					>
						<div
							className={`h-auto w-max text-lg ${
								theme === LTHEME.DARK
									? "text-white"
									: "text-black"
							} `}
						>
							Choose Export Format
						</div>
						<LUISelectT2
							options={ExportTypes}
							currentOption={exportType}
							onOptionChange={setExportType}
						/>
					</div>
					<div className={`h-max w-full`}>
						<button
							className={`h-max w-max text-base ${
								theme === LTHEME.DARK
									? "bg-white text-black"
									: "bg-black text-white"
							} cursor-pointer rounded-full px-6 py-1 active:scale-95`}
							onClick={handleExport}
						>
							Export
						</button>
					</div>
				</div>
			</LUISettingsLayout>
		</motion.div>
	);
};

export { Page as LUIExport };
