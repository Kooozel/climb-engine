import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/", "coverage/"] },

  // Library sources. No globals at all: a browser or Node global appearing in
  // the root closure should fail here, not only in tsconfig.engine.json.
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": "warn",
    },
  },

  // Node.js context: the CLI, which reads files and writes stdout — that is its
  // whole purpose — and the build scripts.
  {
    files: ["src/cli/**/*.ts", "scripts/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
    },
  }
);
