# VERIFICATION-010 — Identidad, acceso y roles

Evidencia por tarea. Se llena a medida que avanza el módulo; el cierre formal (todos los
criterios de aceptación de `spec.md` §12 marcados) es T-110.

---

## T-001 — Modelos `Person`, `UserAccount`, `Session` + migración

**Fecha:** 2026-08-10 · **Migración:** `20260810200559_identity_person_account_session`

### Verificación exigida por la tarea

| Criterio | Resultado |
|---|---|
| `pnpm db:migrate:dev` corre limpio | ✅ migración creada y aplicada contra PostgreSQL 16 real (contenedor de `docker-compose.yml`) |
| La migración revierte con `down` | ✅ ciclo **up → down → up** ejecutado completo: `down.sql` deja 0 tablas de negocio y 0 enums; `migrate deploy` la re-aplica |

### Cumplimiento de principios (comprobado contra la base, no asumido)

| Principio | Cómo se verificó | Resultado |
|---|---|---|
| P-08 · timestamps en UTC | consulta a `information_schema.columns` | ✅ 11/11 columnas de fecha-hora son `timestamp with time zone`; **0** sin zona. `birthdate` es `date` (es una fecha, no un instante) |
| `docs/02` · `id` = UUID v7 ordenable | inserción de dos filas consecutivas | ✅ nibble de versión `7` (`019fed4f-7ffd-7a43-…`) y `id₁ < id₂` |
| `docs/02` · nombres en snake_case | SQL de la migración | ✅ tablas `person`, `user_account`, `session`; columnas `club_id`, `full_name`, `password_hash`… |
| P-06 · nada se borra por accidente | SQL de la migración | ✅ las dos llaves foráneas quedaron `ON DELETE RESTRICT` |
| R-010-01 · una persona, máximo una cuenta | intento de crear una segunda cuenta para la misma persona | ✅ rechazado con `P2002` |
| `docs/09` D-05 · correo de acceso único global | intento de reusar el correo en otro club | ✅ rechazado con `P2002` |
| HU-010-01 · la cuenta nace `invited` | lectura del registro creado | ✅ `status = invited`, `failed_attempts = 0` |

### Hallazgos que corrigieron el plan

1. **T-005 no necesita SQL crudo.** El plan asumía un índice parcial
   `UNIQUE(club_id, email) WHERE email IS NOT NULL`. Comprobado empíricamente: PostgreSQL ya
   trata los `NULL` como distintos en un índice único, así que el `@@unique([clubId, email])`
   normal de Prisma da el comportamiento pedido — dos personas del mismo club con `email`
   vacío conviven, y el mismo correo no vacío choca. T-005 se reduce a automatizar el test.
2. **Riesgo R-1 resuelto** como `docs/09` D-05 (un correo = un acceso, con club activo en la
   sesión). Se corrigió la nota contradictoria de `docs/02` §B, que decía "único por club".
3. **Prisma estaba en la versión equivocada.** El andamiaje quedó en 5.22 cuando `ADR-002`
   especifica Prisma 6; se corrigió a 6.19.3 antes de generar la primera migración.
4. **El CI probaba mal la reversibilidad.** Usaba `prisma migrate reset`, que es destructivo y
   no prueba el `down` de la migración. Ahora aplica el `down.sql` real, borra la fila de
   `_prisma_migrations` y re-aplica — y **falla si una migración llega sin `down.sql`**.

### Pendiente declarado

- La verificación de esta tarea se hizo con una prueba de humo **manual y desechable**, no
  versionada. Los tests automatizados del módulo empiezan en T-010 (dominio puro) y los de
  integración contra Postgres en T-030 en adelante. Hasta entonces, estas garantías **no
  están protegidas contra regresión** — es deuda conocida y acotada, no un descuido.
