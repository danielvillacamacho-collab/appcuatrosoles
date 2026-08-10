# Plataforma de Polo — Club Los Pinos / Cuatro Soles

Producto para clubes de polo. Cliente cero: Club Los Pinos · Organización Cuatro Soles.
Construido por una sola persona (Daniel) con Claude Code, bajo metodología *Spec Driven
Development*. Ver `CLAUDE.md` para la ley del repo y `docs/10-operating-manual-solo.md`
para el método de trabajo día a día.

## Cómo se usa

```
1. Lee  CLAUDE.md               → la ley del repo (Claude Code la carga sola)
2. Lee  memory/constitution.md  → principios que no se negocian
3. Lee  docs/00 a 09            → decisiones técnicas ya tomadas y por qué
4. Toma specs/<NNN>/spec.md     → genera plan.md, luego tasks.md, luego código
```

Orden de construcción: `docs/roadmap.md`.

## Estructura

| Ruta | Qué contiene |
|---|---|
| `CLAUDE.md` | Instrucciones permanentes para el agente |
| `memory/constitution.md` | Principios de ingeniería no negociables |
| `docs/00-stack-decision.md` | ADRs: lenguajes, frameworks, por qué y qué se descartó |
| `docs/01-architecture.md` | Capas, estructura de carpetas, patrones |
| `docs/02-domain-model.md` | Modelo de datos completo, invariantes, ERD |
| `docs/03-api-conventions.md` | REST, errores, paginación, idempotencia |
| `docs/04-frontend-conventions.md` | Mobile-first, design tokens, rutas, estado |
| `docs/05-testing-strategy.md` | Pirámide, umbrales, qué se testea sí o sí |
| `docs/06-security-privacy.md` | Sesión, RBAC, auditoría, Ley 1581 |
| `docs/07-deployment-ec2.md` | Una EC2, docker compose, Caddy, backups, CI/CD |
| `docs/08-configuration-catalog.md` | Todo lo parametrizable (= preguntas al club) |
| `docs/09-open-questions.md` | Decisiones tomadas y pendientes con su default vigente |
| `docs/10-operating-manual-solo.md` | Cómo construir esto solo con Claude Code, sin equipo |
| `docs/brand/` | Brandbook, logos y mockups visuales de referencia |
| `docs/source/` | El documento Word original — insumo, no referencia viva |
| `docs/roadmap.md` | Fases, dependencias, corte de primera versión |
| `specs/SPEC-TEMPLATE.md` | Plantilla obligatoria |
| `specs/NNN-*/spec.md` | Un spec por módulo |
| `apps/api` | Backend NestJS |
| `apps/web` | Frontend React |
| `packages/domain` | Reglas de negocio del polo, TypeScript puro |

## Estado real de los specs (2026-08-10)

Una sesión anterior había avanzado los 15 módulos, pero al recuperar el trabajo sólo
sobrevivieron tres specs de módulo completos más el módulo base reconstruido desde el
documento fuente. El resto se genera **justo antes de construirlo**, como manda el método
(no antes: ver `docs/roadmap.md` — "no se construye para el cliente cinco antes de que el
cliente cero lo use").

| # | Módulo | spec | plan | tasks | Nota |
|---|---|---|---|---|---|
| 010 | Identidad, acceso y roles | ✅ | ✅ | ✅ | Reconstruido 2026-08-10, módulo de referencia |
| 020 | Club, organizaciones y temporadas | — | — | — | Se escribe al iniciar Fase 1 |
| 030 | Handicaps y delegación | — | — | — | Fase 2 |
| 040 | Canchas y calendario | — | — | — | Fase 2 |
| 050 | Prácticas oficiales | — | — | — | Fase 2 |
| 060 | Copas y torneos | — | — | — | Fase 4 |
| 070 | Clases y bolsas | — | — | — | Fase 3 |
| 080 | Coaches privados | — | — | — | Fase 3 |
| 090 | Caballos y alquiler | — | — | — | Fase 5 |
| 100 | Cobros y pagos | ✅ | — | — | Recuperado |
| 105 | Liquidación entre entidades | ✅ | — | — | Recuperado |
| 110 | Políticas de cancelación | — | — | — | Fase 3 |
| 120 | Notificaciones y tablón | — | — | — | Fase 3 |
| 130 | Reportes y tablero | — | — | — | Fase 5 |
| 140 | Plataforma multi-club | ✅ | — | — | Recuperado |

`plan.md` y `tasks.md` los genera Claude Code por módulo, justo antes de construirlo.
El módulo 010 va completo como referencia de formato y profundidad esperada.
