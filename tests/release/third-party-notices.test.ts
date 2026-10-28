/**
 * @vitest-environment node
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	packageDirOf,
	readBundledPackage,
	renderNotices,
	renderSbom,
	type BundledPackage,
} from "../../scripts/third-party-notices";

const project = { name: "Little Later", version: "9.9.9", license: "MIT" };

describe("packageDirOf", () => {
	it("finds hoisted, scoped and Bun-isolated packages", () => {
		expect(packageDirOf("/r/node_modules/react/index.js")).toBe(
			"/r/node_modules/react",
		);
		expect(
			packageDirOf("/r/node_modules/@phosphor-icons/react/dist/x.mjs"),
		).toBe("/r/node_modules/@phosphor-icons/react");
		expect(
			packageDirOf(
				"/r/node_modules/.bun/dexie@4.0.11/node_modules/dexie/dist/dexie.mjs?commonjs-es-import",
			),
		).toBe("/r/node_modules/.bun/dexie@4.0.11/node_modules/dexie");
		expect(packageDirOf("\0C:\\r\\node_modules\\ws\\index.js")).toBe(
			"C:/r/node_modules/ws",
		);
	});

	it("ignores first-party and virtual modules", () => {
		expect(packageDirOf("/r/src/popup/App.tsx")).toBeUndefined();
		expect(packageDirOf("\0vite/preload-helper.js")).toBeUndefined();
	});
});

describe("readBundledPackage", () => {
	it("reads license metadata and every license or notice file", () => {
		const dir = mkdtempSync(join(tmpdir(), "notices-"));
		mkdirSync(join(dir, "lib"));
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({
				name: "pkg",
				version: "1.2.3",
				licenses: [{ type: "MIT" }, { type: "Apache-2.0" }],
				repository: { url: "git+https://example.test/pkg.git" },
			}),
		);
		writeFileSync(join(dir, "LICENSE"), "MIT text\n");
		writeFileSync(join(dir, "NOTICE.md"), "Notice text\n");
		writeFileSync(join(dir, "README.md"), "not a license");

		expect(readBundledPackage(dir)).toEqual({
			name: "pkg",
			version: "1.2.3",
			license: "MIT OR Apache-2.0",
			homepage: "https://example.test/pkg",
			licenseText: "MIT text\n\nNotice text",
		});
	});
});

describe("renderers", () => {
	const packages: BundledPackage[] = [
		{ name: "zeta", version: "1.0.0", license: "ISC", licenseText: "ISC" },
		{
			name: "@scope/alpha",
			version: "2.0.0",
			license: "(MIT OR Apache-2.0)",
		},
	];

	it("sorts notices and says when a package ships no license file", () => {
		const text = renderNotices(project, packages, ["Font license"]);
		expect(text.indexOf("@scope/alpha 2.0.0")).toBeLessThan(
			text.indexOf("zeta 1.0.0"),
		);
		expect(text).toContain("Font license");
		expect(text).toContain(
			"No license file is shipped with this package; its declared license is (MIT OR Apache-2.0).",
		);
	});

	it("writes a deterministic CycloneDX document with npm purls", () => {
		const sbom = JSON.parse(renderSbom(project, packages));
		expect(sbom.bomFormat).toBe("CycloneDX");
		expect(sbom.metadata.component["bom-ref"]).toBe("little-later@9.9.9");
		expect(sbom.components[0]).toMatchObject({
			group: "@scope",
			name: "alpha",
			purl: "pkg:npm/%40scope/alpha@2.0.0",
			licenses: [{ expression: "MIT OR Apache-2.0" }],
		});
		expect(sbom.components[1].licenses).toEqual([
			{ license: { id: "ISC" } },
		]);
		expect(sbom.dependencies[0].dependsOn).toHaveLength(2);
		expect(renderSbom(project, [...packages].reverse())).toBe(
			renderSbom(project, packages),
		);
	});
});
