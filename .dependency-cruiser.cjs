/**
 * Fitness functions de arquitectura (memory/constitution.md P-15, ADR-014 punto 1).
 * Falla el build si una capa importa algo que no le corresponde.
 */
module.exports = {
  forbidden: [
    {
      name: "domain-no-framework",
      comment:
        "packages/domain no puede importar NestJS, Prisma, HTTP ni nada fuera de sí mismo o de otro paquete de dominio (constitution P-01).",
      severity: "error",
      from: { path: "^packages/domain" },
      to: {
        path: "^(apps/|node_modules/(@nestjs|@prisma|prisma|express|fastify))",
      },
    },
    {
      name: "no-cross-feature-imports",
      comment:
        "Un módulo de apps/api no puede importar directamente de otro módulo — sólo vía packages/domain o eventos (docs/01-architecture.md §2).",
      severity: "error",
      from: { path: "^apps/api/src/modules/([^/]+)/" },
      to: {
        path: "^apps/api/src/modules/([^/]+)/",
        pathNot: "^apps/api/src/modules/$1/",
      },
    },
    {
      name: "no-orphans",
      comment: "Archivo sin ninguna referencia entrante ni saliente — probable código muerto.",
      severity: "warn",
      from: { orphan: true, pathNot: ["\\.spec\\.ts$", "\\.test\\.ts$", "main\\.ts$"] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
  },
};
