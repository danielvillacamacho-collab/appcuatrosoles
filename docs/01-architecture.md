# 01 — Arquitectura

Consecuencia directa de `docs/00-stack-decision.md` y de `memory/constitution.md` P-01, P-05
y P-15. Este documento dice **dónde va cada cosa** y qué verifica que se quedó ahí.

## 1. Monorepo

```
polo-platform/
├── apps/
│   ├── api/            # NestJS. HTTP, auth, orquestación. No contiene reglas de polo.
│   ├── worker/          # Procesa jobs de pg-boss. Mismo código de dominio, otro proceso.
│   └── web/             # React 19 + Vite. SPA mobile-first.
├── packages/
│   ├── domain/          # Reglas del polo. TypeScript puro. Sin NestJS, sin Prisma, sin HTTP.
│   ├── contracts/       # Esquemas Zod compartidos api ⇄ web (request/response de cada endpoint).
│   └── ui/              # Componentes shadcn/ui copiados, tokens de marca (docs/04).
├── docs/                 # Este directorio.
├── memory/
│   └── constitution.md
├── specs/                # Un directorio por módulo.
├── infra/                # Caddyfile, rollback.sh
├── tsconfig.base.json    # Config de TypeScript compartida — cada paquete la extiende.
├── eslint.config.mjs     # Config de ESLint compartida (flat config, ESLint 9).
├── turbo.json            # Grafo de tareas entre paquetes.
├── docker-compose.yml
└── apps/api/prisma/schema.prisma   # Fuente única del esquema. Migraciones versionadas.
```

`pnpm` workspaces + Turborepo para el grafo de tareas (`pnpm build`, `pnpm test` corren en
cascada respetando dependencias entre paquetes).

## 2. Capas dentro de `apps/api`

```
apps/api/src/
├── modules/
│   └── <feature>/            # p.ej. identity, practices, tournaments
│       ├── <feature>.controller.ts   # HTTP. Valida con Zod, traduce a comandos.
│       ├── <feature>.service.ts      # Orquesta: llama repos + domain + jobs. Sin reglas de polo.
│       ├── <feature>.repository.ts   # Único lugar que toca Prisma. Aplica scope de club_id.
│       ├── <feature>.module.ts
│       └── __tests__/
├── common/
│   ├── guards/             # AuthGuard, PermissionGuard, TenantGuard
│   ├── decorators/         # @RequirePermission(), @CurrentUser(), @ActiveClub()
│   ├── filters/             # Traduce excepciones de dominio y de Postgres a HTTP + es-CO
│   └── interceptors/         # Request-id, logging, auditoría automática de mutaciones
└── main.ts
```

**Regla de dependencia (verificada por `dependency-cruiser` en CI, `ADR-014`):**

```
apps/api/modules/*  →  packages/domain   (permitido, es la única flecha hacia domain)
apps/api/modules/*  →  packages/contracts (permitido)
apps/api/modules/A  →  apps/api/modules/B (PROHIBIDO — sólo vía eventos o puertos públicos)
packages/domain     →  NestJS | Prisma | HTTP | Date.now()  (PROHIBIDO, sin excepción)
```

Si el módulo de prácticas necesita algo del módulo de handicaps, no importa su servicio: usa
un puerto (`HandicapReader`) que ambos implementan/consumen a través de `packages/domain` o
mediante un evento de dominio. La frontera existe para que un cambio en copas no obligue a
entender identidad.

## 3. `packages/domain`: la forma de una regla de negocio

Cada regla es una función pura, sin efectos secundarios, con sus tipos de entrada/salida
explícitos y sin excepciones para casos de negocio (se devuelve un `Result`, ver abajo).

```ts
// packages/domain/practices/balanceTeams.ts
export function balanceTeams(
  players: PlayerHandicap[],
  handicapType: 'international' | 'club',
): Result<TeamAssignment, UnbalanceableError> { ... }

// packages/domain/handicap/halfMan.ts
export function effectiveHandicap(a: HandicapHalves, b: HandicapHalves): HandicapHalves {
  return max(a, b); // P-03: el puesto compartido pesa el máximo, nunca la suma ni el promedio
}
```

**Tipo `Result` en vez de excepciones para errores de negocio.** Una excepción es para lo
inesperado (la base de datos no responde). Un equipo que no se puede balancear, un cupo que
ya no existe, un handicap fuera de rango: son resultados esperables del dominio, se modelan
como valores (`Result<T, E>` estilo `neverthrow`), no como `throw`. Esto obliga a que quien
llama la función maneje el caso infeliz en el tipo, no lo olvide en un `try/catch`.

**El puerto `Clock`** (P-08): toda función de dominio que necesita "ahora" lo recibe como
parámetro. `apps/api` inyecta `SystemClock`; los tests inyectan `FixedClock(unaFechaExacta)`.

## 4. Puertos y adaptadores en el borde del sistema

Todo lo que habla con el mundo exterior se define como interfaz en `packages/domain` (o en
`apps/api/common/ports` si es puramente de infraestructura) y se implementa en un adaptador
reemplazable:

| Puerto | Adaptador v1 | Alternativa prevista |
|---|---|---|
| `PaymentGateway` | `WompiGateway` (o `FakeGateway` en dev/test) | PayU, Mercado Pago |
| `Mailer` | `SesMailer` | `ResendMailer` |
| `JobQueue` | `PgBossQueue` | — (ver `ADR-012`) |
| `FileStorage` | `S3Storage` (URLs prefirmadas) | — |
| `Clock` | `SystemClock` | `FixedClock` (tests) |

Ningún módulo de `apps/api` importa el SDK de Wompi, AWS SDK o `pg-boss` directamente fuera
de su adaptador. Cambiar de pasarela es cambiar un archivo, no perseguir imports por todo el
código — ésta es la prueba de que el puerto está bien puesto.

## 5. `apps/web`: estructura de rutas

Ver `docs/04-frontend-conventions.md` para convenciones de UI. A nivel estructural:

```
apps/web/src/
├── routes/          # TanStack Router, rutas tipadas por archivo
├── features/
│   └── <feature>/
│       ├── api/        # hooks de TanStack Query, usan packages/contracts
│       ├── components/
│       └── screens/
├── i18n/es-CO.ts    # Todo el copy visible al usuario. Ningún componente hardcodea texto.
└── ui/              # re-exporta packages/ui
```

## 6. Fitness functions (qué corre en CI y por qué)

`docs/05-testing-strategy.md` detalla umbrales; aquí sólo la razón arquitectónica:

- **`pnpm check:arch`** (`dependency-cruiser`): falla si `packages/domain` importa algo de
  fuera de sí mismo o de otro paquete de dominio; falla si un módulo de `apps/api` importa
  otro módulo directamente.
- **`pnpm check:isolation`**: cada ruta HTTP registrada debe tener una prueba que confirma
  que un usuario del club A recibe `404` al pedir un recurso del club B por id.
- **`pnpm check:permissions`**: cada controlador debe declarar `@RequirePermission(...)`; el
  arranque falla si encuentra una ruta mutante sin decorador (P-05, P-13).

Estas tres son la razón de que este documento sea código, no sólo prosa: una arquitectura que
sólo vive en un `.md` se degrada en la sesión 40; una que un script verifica, no.
