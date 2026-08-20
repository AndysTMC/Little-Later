/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { ManifestV3Export, crx } from "@crxjs/vite-plugin";
import manifestJson from "./manifest.json";

const manifest = manifestJson as ManifestV3Export;
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const sharedSrc = path.resolve(projectRoot, "packages/shared/src");

export default defineConfig({
	// server: {
	// 	hmr: {
	// 		host: "6shtbbqw-5173.inc1.devtunnels.ms",
	// 		protocol: "ws",
	// 		port: 443,
	// 	},
	// },
	plugins: [react(), tsconfigPaths(), tailwindcss(), crx({ manifest })],
	resolve: {
		alias: [
			{
				find: /^little-shared$/,
				replacement: path.join(sharedSrc, "index.ts"),
			},
			{
				find: /^little-shared\/(.*)$/,
				replacement: path.join(sharedSrc, "$1"),
			},
		],
	},
	build: {
		target: "ES2022",
		chunkSizeWarningLimit: 1500,
		rollupOptions: {
			output: {},
		},
	},
	test: {
		environment: "jsdom",
		setupFiles: ["./tests/setup.ts"],
	},
});
