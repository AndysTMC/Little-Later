import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { ManifestV3Export, crx } from "@crxjs/vite-plugin";
import manifestJson from "./manifest.json";
import packageJson from "./package.json";
import { thirdPartyNotices } from "./scripts/third-party-notices";

const manifest = manifestJson as ManifestV3Export;
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const sharedSrc = path.resolve(projectRoot, "packages/shared/src");

export default defineConfig(({ command }) => ({
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
		// The dev server writes its own unpacked extension, so it never
		// replaces the production build in dist/ that the extension tests
		// and hand testing load.
		outDir: command === "serve" ? "dist-dev" : "dist",
		target: "es2022",
		chunkSizeWarningLimit: 1500,
	},
	test: {
		// artifacts/ holds local scratch work, such as a reviewer's copy
		// of the tests.
		exclude: [...configDefaults.exclude, "artifacts/**"],
		environment: "jsdom",
		setupFiles: ["./tests/setup.ts"],
		projects: [
			{
				extends: true,
				test: {
					name: "dom",
					environment: "jsdom",
					include: [
						"tests/popup/**/*.test.{ts,tsx}",
						"tests/panel/**/*.test.{ts,tsx}",
						"tests/notes/**/*.test.{ts,tsx}",
						"tests/services/**/*.test.{ts,tsx}",
						"tests/regressions.test.ts",
						"tests/storage/session.test.ts",
						"tests/utils/saveFile.test.ts",
						"tests/utils/safe-image-blob.test.ts",
					],
				},
			},
			{
				extends: true,
				test: {
					name: "node",
					environment: "node",
					include: ["tests/**/*.test.{ts,tsx}"],
					exclude: [
						...configDefaults.exclude,
						"artifacts/**",
						"tests/popup/**/*.test.{ts,tsx}",
						"tests/panel/**/*.test.{ts,tsx}",
						"tests/notes/**/*.test.{ts,tsx}",
						"tests/services/**/*.test.{ts,tsx}",
						"tests/regressions.test.ts",
						"tests/storage/session.test.ts",
						"tests/utils/saveFile.test.ts",
						"tests/utils/safe-image-blob.test.ts",
					],
				},
			},
		],
	},
}));
