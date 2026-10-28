/**
 * Vite plugin that lists the npm packages actually bundled into the
 * extension and emits THIRD_PARTY_NOTICES.txt (license texts) and
 * sbom.cdx.json (CycloneDX 1.6) next to the build. Output is sorted and
 * carries no timestamps, so the same lockfile gives the same files.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

export type BundledPackage = {
	name: string;
	version: string;
	license: string;
	homepage?: string;
	licenseText?: string;
};

export type ProjectInfo = {
	name: string;
	version: string;
	license: string;
};

const NODE_MODULES = "/node_modules/";
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

/** Package directory of a bundled module id, or undefined for first-party code. */
export const packageDirOf = (moduleId: string): string | undefined => {
	const id = moduleId.replace(/\\/g, "/").replace(/^\0/, "").split("?")[0];
	const at = id.lastIndexOf(NODE_MODULES);
	if (at === -1) return undefined;
	const rest = id.slice(at + NODE_MODULES.length).split("/");
	const depth = rest[0].startsWith("@") ? 2 : 1;
	if (rest.length <= depth) return undefined;
	return (
		id.slice(0, at + NODE_MODULES.length) + rest.slice(0, depth).join("/")
	);
};

const licenseOf = (pkg: Record<string, unknown>): string => {
	if (typeof pkg.license === "string") return pkg.license;
	const legacy = pkg.licenses ?? pkg.license;
	const list = Array.isArray(legacy) ? legacy : legacy ? [legacy] : [];
	const types = list
		.map((entry) => (entry as { type?: unknown }).type)
		.filter((type): type is string => typeof type === "string");
	return types.length > 0 ? types.join(" OR ") : "UNKNOWN";
};

const homepageOf = (pkg: Record<string, unknown>): string | undefined => {
	if (typeof pkg.homepage === "string") return pkg.homepage;
	const repo = pkg.repository;
	const url =
		typeof repo === "string"
			? repo
			: (repo as { url?: unknown } | undefined)?.url;
	return typeof url === "string"
		? url.replace(/^git\+/, "").replace(/\.git$/, "")
		: undefined;
};

export const readBundledPackage = (dir: string): BundledPackage => {
	const pkg = JSON.parse(
		readFileSync(join(dir, "package.json"), "utf8"),
	) as Record<string, unknown>;
	const licenseFiles = readdirSync(dir)
		.filter((file) => LICENSE_FILE.test(file))
		.sort();
	const licenseText = licenseFiles
		.map((file) => readFileSync(join(dir, file), "utf8").trim())
		.join("\n\n");
	return {
		name: String(pkg.name),
		version: String(pkg.version),
		license: licenseOf(pkg),
		homepage: homepageOf(pkg),
		licenseText: licenseText || undefined,
	};
};

const byNameAndVersion = (a: BundledPackage, b: BundledPackage): number =>
	a.name === b.name
		? a.version.localeCompare(b.version)
		: a.name.localeCompare(b.name);

export const renderNotices = (
	project: ProjectInfo,
	packages: BundledPackage[],
	extra: string[] = [],
): string => {
	const rule = "-".repeat(72);
	const sections = [...packages]
		.sort(byNameAndVersion)
		.map((pkg) =>
			[
				`${pkg.name} ${pkg.version}`,
				`License: ${pkg.license}`,
				...(pkg.homepage ? [`Source: ${pkg.homepage}`] : []),
				"",
				pkg.licenseText ??
					`No license file is shipped with this package; its declared license is ${pkg.license}.`,
			].join("\n"),
		);
	return [
		`${project.name} ${project.version} includes the third-party software listed below.`,
		`${project.name} itself is licensed under ${project.license}; see LICENSE.md in the source repository.`,
		...extra,
		...sections,
	].join(`\n\n${rule}\n\n`);
};

const purlOf = (pkg: { name: string; version: string }): string =>
	`pkg:npm/${pkg.name.replace(/^@/, "%40")}@${pkg.version}`;

const cdxLicense = (license: string) =>
	/^[A-Za-z0-9.+-]+$/.test(license)
		? [{ license: { id: license } }]
		: /\b(AND|OR|WITH)\b/.test(license)
			? [{ expression: license.replace(/^\((.*)\)$/, "$1") }]
			: [{ license: { name: license } }];

const cdxComponent = (pkg: BundledPackage) => {
	const slash = pkg.name.startsWith("@") ? pkg.name.indexOf("/") : -1;
	return {
		type: "library",
		"bom-ref": purlOf(pkg),
		...(slash > 0 ? { group: pkg.name.slice(0, slash) } : {}),
		name: slash > 0 ? pkg.name.slice(slash + 1) : pkg.name,
		version: pkg.version,
		purl: purlOf(pkg),
		...(pkg.license !== "UNKNOWN"
			? { licenses: cdxLicense(pkg.license) }
			: {}),
		...(pkg.homepage
			? { externalReferences: [{ type: "website", url: pkg.homepage }] }
			: {}),
	};
};

export const renderSbom = (
	project: ProjectInfo,
	packages: BundledPackage[],
): string => {
	const sorted = [...packages].sort(byNameAndVersion);
	const root = `${project.name.toLowerCase().replace(/\W+/g, "-")}@${project.version}`;
	return `${JSON.stringify(
		{
			bomFormat: "CycloneDX",
			specVersion: "1.6",
			version: 1,
			metadata: {
				component: {
					type: "application",
					"bom-ref": root,
					name: project.name,
					version: project.version,
					licenses: cdxLicense(project.license),
				},
			},
			components: sorted.map(cdxComponent),
			dependencies: [
				{ ref: root, dependsOn: sorted.map((pkg) => purlOf(pkg)) },
			],
		},
		null,
		"\t",
	)}\n`;
};

/** Text files under `public/` (for example font licenses) appended verbatim. */
const publicNotices = (publicDir: string, files: string[]): string[] =>
	files
		.filter((file) => existsSync(join(publicDir, file)))
		.map(
			(file) =>
				`Shipped as ${file}:\n\n${readFileSync(join(publicDir, file), "utf8").trim()}`,
		);

export const thirdPartyNotices = (
	project: ProjectInfo,
	options: { publicDir: string; publicLicenseFiles: string[] },
): Plugin => ({
	name: "little-later:third-party-notices",
	apply: "build",
	generateBundle(_options, bundle) {
		const dirs = new Set<string>();
		for (const output of Object.values(bundle)) {
			if (output.type !== "chunk") continue;
			for (const id of Object.keys(output.modules)) {
				const dir = packageDirOf(id);
				if (dir) dirs.add(dir);
			}
		}
		const seen = new Map<string, BundledPackage>();
		for (const dir of dirs) {
			const pkg = readBundledPackage(dir);
			seen.set(`${pkg.name}@${pkg.version}`, pkg);
		}
		const packages = [...seen.values()];
		this.emitFile({
			type: "asset",
			fileName: "THIRD_PARTY_NOTICES.txt",
			source: renderNotices(
				project,
				packages,
				publicNotices(options.publicDir, options.publicLicenseFiles),
			),
		});
		this.emitFile({
			type: "asset",
			fileName: "sbom.cdx.json",
			source: renderSbom(project, packages),
		});
	},
});
