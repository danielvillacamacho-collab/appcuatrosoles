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
      // NestJS declara módulos/controladores con clases decoradas sin miembros propios
      // (@Module({...}) export class FooModule {}) — es el patrón normal del framework,
      // no una clase sobrante.
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            "Prohibido Date.now() en packages/domain — inyecta Clock (constitution P-08).",
        },
        {
          // Sólo el `new Date()` sin argumentos (== "ahora") está prohibido. Construir una
          // fecha a partir de un literal (`new Date("2026-08-10T...")`) es normal y necesario,
          // incluso dentro de packages/domain (fixtures, valores fijos en tests).
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            "Prohibido `new Date()` sin argumentos en packages/domain — inyecta Clock (constitution P-08).",
        },
      ],
    },
  },
  {
    // El andamiaje de tests necesita reportar progreso por consola (levantar el contenedor,
    // aplicar migraciones): sin eso, una corrida lenta parece colgada.
    files: ["**/test/**"],
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/*.config.*"],
  },
);
