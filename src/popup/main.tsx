import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { paintRoot, readLookHint } from "./themeHint";
import { fitCeremonyWindow } from "./ceremonyWindow";

// Before the first paint, the way the popup last looked.
paintRoot(readLookHint());
// A security key's own window shows the page at the popup's size.
void fitCeremonyWindow();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
