/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { ManifestV3Export, crx } from "@crxjs/vite-plugin";
import manifestJson from "./manifest.json";
import packageJson from "./package.json";
import { thirdPartyNotices } from "./scripts/third-party-notices";

const manifest = manifestJson as ManifestV3Export;
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const sharedSrc = path.resolve(projectRoot, "packages/shared/src");

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		crx({ manifest }),
		thirdPartyNotices(
			{
				name: manifestJson.name,
				version: manifestJson.version,
				license: packageJson.license,
			},
			{
				publicDir: path.join(projectRoot, "public"),
				publicLicenseFiles: ["fonts/OFL.txt"],
			},
		),
	],
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
		target: "es2022",
		chunkSizeWarningLimit: 1500,
	},
	test: {
		environment: "jsdom",
		setupFiles: ["./tests/setup.ts"],
	},
});
