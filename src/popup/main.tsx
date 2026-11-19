import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { paintRoot, readLookHint } from "./themeHint";

// Before the first paint, the way the popup last looked.
paintRoot(readLookHint());

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
