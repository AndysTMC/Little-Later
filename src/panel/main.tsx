import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../popup/index.css";
import "../popup/App.css";
import { paintRoot, readLookHint } from "../popup/themeHint";
import { listenForFiles } from "../utils/saveFile";
import { PanelApp } from "./PanelApp";
import type { Surface } from "./ChatScreen";

// LittleAI's page: the side panel, or a tab when opened with
// ?surface=tab. Either fills its frame, unlike the popup's fixed size.
const surface: Surface =
	new URLSearchParams(location.search).get("surface") === "tab"
		? "tab"
		: "panel";
document.documentElement.dataset.surface = surface;
paintRoot(readLookHint());
// Files LittleAI's runs make in the worker, such as an export, save here.
listenForFiles();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<PanelApp surface={surface} />
	</StrictMode>,
);
