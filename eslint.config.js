import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{ ignores: ["dist", "dist-dev", "artifacts", "packages/**/dist"] },
	{
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser,
		},
		plugins: {
			"react-hooks": reactHooks,
			"react-refresh": reactRefresh,
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			"react-refresh/only-export-components": [
				"warn",
				{ allowConstantExport: true },
			],
		},
	},
	{
		// The service worker is the only writer (decision 0012): page code
		// reads the database and sends commands to change it.
		files: [
			"src/popup/**",
			"src/panel/**",
			"src/services/**",
			"src/utils/**",
		],
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					selector:
						"CallExpression[callee.object.object.name='littleDB'][callee.property.name=/^(add|bulkAdd|put|bulkPut|update|bulkUpdate|delete|bulkDelete|clear|modify)$/]",
					message:
						"Pages do not write tables; send a command (decision 0012).",
				},
				{
					selector:
						"CallExpression[callee.object.name='littleDB'][callee.property.name='transaction'][arguments.0.value=/^rw/]",
					message:
						"Pages do not write tables; send a command (decision 0012).",
				},
			],
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["**/storage/profiles"],
							message:
								"Profile changes are commands (decision 0012).",
						},
						{
							group: ["**/storage/repositories"],
							importNames: ["putPreview"],
							message:
								"Pages do not write tables; send a command (decision 0012).",
						},
					],
				},
			],
		},
	},
);
