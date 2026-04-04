import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { ManifestV3Export, crx } from "@crxjs/vite-plugin";
import manifestJson from "./manifest.json";

const manifest = manifestJson as ManifestV3Export;

export default defineConfig({
	// server: {
	// 	hmr: {
	// 		host: "6shtbbqw-5173.inc1.devtunnels.ms",
	// 		protocol: "ws",
	// 		port: 443,
	// 	},
	// },
	plugins: [react(), tsconfigPaths(), tailwindcss(), crx({ manifest })],
	build: {
		target: "ES2022",
		chunkSizeWarningLimit: 1500,
		rollupOptions: {
			output: {},
		},
	},
});
