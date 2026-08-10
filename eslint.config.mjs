// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * CLAUDE.md regla de oro: prohibido `any`, prohibido `@ts-ignore`, prohibido `console.log`
 * en código de producción (ADR-014 punto 10). CI falla con warnings — no hay umbral suave.
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            "Prohibido Date.now() en packages/domain — inyecta Clock (constitution P-08).",
        },
      ],
    },
  },
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/*.config.*"],
  },
);
