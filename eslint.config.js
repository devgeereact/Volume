// @ts-check
// ESLint flat config for the whole monorepo (D-023). Type-aware typescript-eslint rules for TypeScript,
// React hooks rules for apps/web, Node globals for the server, packages, scripts and tests.
// Formatting is Prettier's job, so eslint-config-prettier goes last to switch off clashing style rules.
import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "**/dist-*/",
    "**/build/",
    "**/coverage/",
    "**/test-results/",
    "**/playwright-report/",
    "**/screenshots/",
    "**/.vite/",
    "data/",
    // Assistant tooling, design reference prototypes and the token generator's output.
    ".claude/",
    ".agent/",
    "design/",
  ]),

  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },

  // TypeScript: recommended plus type-checked rules, typed through each workspace's tsconfig.json.
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          // The one TypeScript file outside every tsconfig.json (Vite's build config).
          allowDefaultProject: ["apps/web/vite.config.ts"],
          defaultProject: "tsconfig.base.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Leading underscore marks a deliberately unused binding.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },

  // Plain JavaScript (Node scripts and tooling): core recommended rules, no type information.
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },

  // Browser app: the React hooks rules, including the React Compiler checks (purity, refs, effects).
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
    languageOptions: { globals: globals.browser },
  },

  // Node code: server, packages, scripts, tests and build config.
  {
    files: [
      "apps/server/**/*.{ts,mts,js,mjs}",
      "packages/**/*.{ts,mts,js,mjs}",
      "scripts/**/*.{ts,mts,js,mjs}",
      "tests/**/*.{ts,mts,js,mjs}",
      "apps/web/scripts/**/*.{js,mjs}",
      "apps/web/vite.config.ts",
      "eslint.config.js",
    ],
    languageOptions: { globals: globals.node },
  },

  // Playwright drivers: callbacks passed to page.evaluate run in the browser.
  {
    files: ["apps/web/scripts/**/*.{js,mjs}", "tests/e2e/**/*.{ts,mts,js,mjs}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  prettier,
]);
