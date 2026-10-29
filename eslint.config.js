import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "@typescript-eslint/eslint-plugin/use-at-your-own-risk/raw-plugin";

export default [
	{ ignores: ["dist"] },
	js.configs.recommended,
	...tseslint.flatConfigs["flat/recommended"],
	{
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
			// React Compiler rules new in eslint-plugin-react-hooks 7. The
			// popup has ~44 existing hits; they are fixed screen by screen
			// in the design-system phase, then raised back to errors.
			"react-hooks/refs": "warn",
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/immutability": "warn",
			"react-refresh/only-export-components": [
				"warn",
				{ allowConstantExport: true },
			],
		},
	},
	{
		// The service worker is the only writer (decision 0012): page code
		// reads the database and sends commands to change it.
		files: ["src/popup/**", "src/services/**", "src/utils/**"],
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
];
