/**
 * Fitness functions de arquitectura (memory/constitution.md P-15, ADR-014 punto 1).
 * Falla el build si una capa importa algo que no le corresponde.
 *
 * Historia que conviene no repetir (T-010): la primera versión de estas reglas intentaba
 * detectar imports prohibidos por el **nombre del paquete** (`node_modules/@prisma/...`) y por
 * el **tipo de dependencia** (`npm`). No detectaba nada, y el proyecto pasó cuatro tareas
 * creyendo que el dominio estaba protegido. Dos razones:
 *
 *   1. Con pnpm, la ruta real es `node_modules/.pnpm/@prisma+client@X/node_modules/@prisma/client`,
 *      así que un patrón anclado con `^node_modules/` nunca casa.
 *   2. Peor: como pnpm aísla las dependencias, `@prisma/client` **no se puede resolver** desde
 *      `packages/domain`, así que llega con tipo `unknown` y sin ruta en disco — y ninguna regla
 *      basada en el nombre resuelto o en el tipo lo iba a ver.
 *
 * La lección es que la regla no debe enumerar lo prohibido, sino **declarar lo permitido**: el
 * dominio sólo puede importar archivos del propio dominio. Así no depende de cómo se resuelva
 * nada, y atrapa también el próximo paquete que a alguien le parezca inofensivo.
 */
module.exports = {
  forbidden: [
    {
      name: "domain-solo-imports-locales",
      comment:
        "packages/domain es TypeScript puro (constitution P-01): sólo puede importar archivos de " +
        "packages/domain/src. Ni npm, ni otro paquete del workspace, ni una app, ni módulos de " +
        "Node. Si una regla de polo necesita algo de afuera, se le inyecta por un puerto (como el " +
        "Clock), no se importa. Los tests del dominio quedan fuera de la regla: sí usan vitest.",
      severity: "error",
      from: {
        path: "^packages/domain/src",
        pathNot: "(__tests__/|\\.spec\\.ts$)",
      },
      to: {
        pathNot: "^packages/domain/src",
      },
    },
    {
      name: "no-imports-sin-resolver",
      comment:
        "Un import que no se puede resolver es un bug, no un aviso: o está mal escrito, o el " +
        "paquete no está declarado como dependencia de ESE paquete del workspace (pnpm aísla, y " +
        "eso es una ventaja: obliga a declarar lo que se usa).",
      severity: "error",
      from: { pathNot: "(__tests__/|\\.spec\\.ts$)" },
      to: { couldNotResolve: true },
    },
    {
      name: "no-cross-feature-imports",
      comment:
        "Un módulo de apps/api no puede importar directamente de otro módulo — sólo vía " +
        "packages/domain o eventos (docs/01-architecture.md §2).",
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
    // Defensa en profundidad: aunque el script de package.json ya apunta sólo a src/,
    // esto evita que dist/ o coverage/ (artefactos generados, no código) se cuelen si
    // alguien corre depcruise directo sobre todo el árbol.
    exclude: { path: "(^|/)(dist|coverage)(/|$)" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
  },
};
