# CLAUDE.md — Instrucciones permanentes del repositorio

> Este archivo lo lee Claude Code en cada sesión. Es la ley del repo.
> Si algo aquí contradice una instrucción puntual del prompt, **gana este archivo**,
> salvo que el humano diga explícitamente "salta la constitución".

## Qué estamos construyendo

Plataforma web (mobile-first) de gestión de polo para el **Club Los Pinos** y la
organización **Cuatro Soles**. Reemplaza WhatsApp + Excel para: prácticas, copas,
handicaps, clases, coaches, caballos, canchas, pagos y avisos.

Fuente funcional de verdad: `docs/` + `specs/`. El documento Word original
(`documento_consolidado_polo2.docx`) es el insumo, **no** la referencia viva.

## Método de trabajo: Spec Driven Development

Ciclo obligatorio por cada unidad de trabajo:

1. `specs/<NNN-modulo>/spec.md` — QUÉ y POR QUÉ. No contiene código ni nombres de clases.
2. `specs/<NNN-modulo>/plan.md` — CÓMO. Entidades, endpoints, archivos, contratos, riesgos.
3. `specs/<NNN-modulo>/tasks.md` — tareas atómicas, ordenadas, cada una verificable.
4. Implementación tarea por tarea, con test **antes o junto** al código.
5. `specs/<NNN-modulo>/verification.md` — evidencia: criterios de aceptación marcados, cobertura.

**Nunca escribas código de producción sin que exista el `spec.md` correspondiente.**
Si te falta información para escribir el spec: **pregunta, no asumas**. Los supuestos
que sí tomes van en la sección `## Supuestos` del spec, marcados como `[SUPUESTO]`.

## Reglas de oro

1. **Español en la UI, inglés en el código.** Identificadores, commits, comentarios y
   documentación técnica en inglés. Textos visibles al usuario en español (es-CO),
   centralizados en `apps/web/src/i18n/es-CO.ts`. Nunca hardcodees copy en un componente.
2. **El dominio del polo es código puro.** Toda regla de negocio (balanceo, handicaps,
   ventajas, fixtures, políticas de cancelación, ledger de bolsas) vive en
   `packages/domain`, sin dependencias de NestJS, Prisma, HTTP ni fecha del sistema.
   Se le inyecta el reloj. Si una regla de polo necesita la base de datos, está mal ubicada.
3. **Dinero en enteros.** `bigint` de centavos COP. Prohibido `float`/`number` para plata.
4. **Handicaps en medios goles enteros.** Se persiste `handicap_halves: int` (1.5 → 3).
   Prohibido decimal en base de datos. La conversión vive en `packages/domain/handicap`.
5. **Todo lo configurable es configuración.** Horas de decisión, ventanas de cancelación,
   cupos, tarifas, penalizaciones y desempates NO se hardcodean: viven en `settings`
   con ámbito club/organización. Ver `docs/08-configuration-catalog.md`.
6. **Multi-tenant desde el día uno.** Toda tabla de negocio lleva `club_id`. El acceso
   se filtra en la capa de repositorio, no en el controlador. Un query sin scope es un bug.
7. **La auditoría es append-only.** Sin UPDATE ni DELETE. El usuario de aplicación no
   tiene esos permisos sobre `audit_log` a nivel de base de datos.
8. **Nada se borra, se archiva.** Borrado real sólo por el flujo de datos personales (Ley 1581).
9. **Zona horaria:** persistir siempre UTC (`timestamptz`), renderizar en `America/Bogota`.
   Prohibido `new Date()` en dominio: se usa el puerto `Clock`.
10. **Errores:** nunca filtres existencia de cuentas, ni datos de terceros. Un recurso de
    otro club responde 404, nunca 403. Ver `docs/06-security-privacy.md`.
11. **Sin Redis.** Las colas y los trabajos programados van sobre PostgreSQL con `pg-boss`
    (ADR-012). No introduzcas otro servicio de infraestructura sin un ADR nuevo.
12. **Ningún gate de CI se desactiva ni se baja.** Si un umbral falla, se escriben los tests.
    Bajar un umbral para que pase el build está prohibido y es motivo de revertir el commit.

## Calidad — no negociable

- TypeScript `strict: true`. Prohibido `any` (usa `unknown` + narrowing). Prohibido `@ts-ignore`.
- ESLint + Prettier en pre-commit. CI falla con warnings.
- Cobertura mínima que rompe el build: **global ≥ 50 %**, `packages/domain` **≥ 85 %**,
  guards y policies de autorización **≥ 90 %**.
- Todo endpoint nuevo trae: test de contrato (schema in/out), test de autorización
  (rol permitido y rol denegado) y test del camino infeliz.
- Toda migración de base de datos es reversible y se prueba en CI contra Postgres real.

## Contexto de negocio (importante para las decisiones)

Esto **no** es un encargo para un solo club: es un producto que se venderá a otros clubes de
polo, junto con servicios de administración deportiva (comisariato, torneos, academia).
Consecuencias que aplican a todo el código:

- El aislamiento entre clubes es el requisito de seguridad número uno. Una consulta sin
  filtro de tenant no es un bug menor: es un incidente comercial.
- El tenant se resuelve por subdominio. Un `clubId` que venga del cliente **nunca** determina
  el tenant.
- Nada se hardcodea a Los Pinos ni a Cuatro Soles: ni un nombre, ni una tarifa, ni una regla.
- Un cobro tiene beneficiario (de quién es la plata) y recaudador (quién la recibe). Pueden
  ser entidades distintas; ver `specs/105`.

Lo construye una sola persona con Claude Code, sin equipo de ingeniería revisando. Por eso:
tareas pequeñas, verificación automática, y ninguna pieza de infraestructura que no sea
imprescindible. Lee `docs/10-operating-manual-solo.md`.

## Comandos

```bash
pnpm dev            # api + web + worker en watch
pnpm dev:celular    # lo mismo, accesible desde un teléfono en el mismo wifi (docs/10 §3.1)
pnpm test           # unit + integration
pnpm test:cov       # con umbrales de cobertura
pnpm test:e2e       # flujos críticos: API (Testcontainers) + navegador (Playwright)
pnpm lint && pnpm typecheck
pnpm db:migrate:dev
pnpm db:seed        # datos demo de un club de ejemplo
pnpm check:isolation # prueba de aislamiento de tenant por endpoint
pnpm check:arch      # fitness functions de dependencias entre capas
pnpm check:bundle    # presupuesto de 200 KB comprimidos de la interfaz (ADR-014)
```

## Cómo pedirme trabajo

- "Implementa `specs/050-practicas/tasks.md` tarea 12" → una tarea, un commit, tests incluidos.
- "Genera el plan de `specs/060-copas`" → sólo `plan.md`, sin tocar código.
- Si una tarea toca más de 5 archivos o supera ~400 líneas de diff, **pártela y avísame**.
