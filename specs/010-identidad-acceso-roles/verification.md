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

---

## T-002 — `PersonOrganization`, `RoleAssignment`, `CommissionerDelegation`

**Fecha:** 2026-08-10 · **Migración:** `20260810204818_identity_organizations_roles_delegation`

### Verificación exigida por la tarea

| Criterio | Resultado |
|---|---|
| Migración `up`/`down` contra Postgres real | ✅ ciclo completo, y además **reversión en cascada**: revertir T-002 deja intactas las tablas de T-001; revertir T-001 encima deja la base vacía sin un solo error; volver a aplicar reconstruye todo |

### Invariantes puestos en la base de datos (P-09), cada uno probado provocando el rechazo

Se añadieron en SQL dentro de la migración, porque Prisma no sabe expresarlos. **Todos
comprobados en ambas direcciones** — que rechacen lo que deben y permitan lo que deben:

| Invariante | Comprobación |
|---|---|
| Un mismo rol con el mismo alcance no se otorga dos veces a la vez | ✅ segundo intento rechazado; ✅ el mismo rol con **otro** alcance sí se permite; ✅ tras revocar, se puede volver a otorgar (el índice es parcial) |
| `scope_id` es NULL exactamente cuando `scope = platform` | ✅ `platform` **con** `scope_id` → rechazado; ✅ `club` **sin** `scope_id` → rechazado; ✅ `platform` sin `scope_id` → permitido |
| Un vínculo persona-organización no se duplica mientras esté activo | ✅ duplicado exacto rechazado; ✅ la misma persona puede ser `student` **y** `team_member` en la misma organización |
| `left_on >= joined_on` | ✅ salir antes de entrar → rechazado |
| `ends_at > starts_at` en una delegación | ✅ terminar antes de empezar → rechazado |
| `delegator_id <> delegate_id` | ✅ el comisario no se delega a sí mismo |

### Decisiones de modelado tomadas y su razón

1. **`club_id` agregado a `person_organization` y `commissioner_delegation`**, aunque `docs/02`
   no lo listaba: P-05 dice que toda tabla de negocio lo lleva. El valor está en que el filtro
   de tenant de la capa de repositorio sea **uniforme**, sin un join distinto por tabla ni una
   lista de excepciones que alguien deba recordar.
2. **`role_assignment` es la única excepción deliberada a P-05.** No lleva `club_id` porque
   `scope` + `scope_id` ya *son* la frontera de tenant, y un `superadmin` tiene
   `scope = platform`, donde no hay club. Un `club_id` paralelo sería una segunda fuente de
   verdad capaz de contradecir a `scope_id`. Queda documentado en el esquema y en `docs/02`
   para que no se lea como un olvido.
3. **`revoked_by_id` con `onDelete: Restrict`**, corrigiendo el `SET NULL` que Prisma pone por
   defecto en relaciones opcionales: `SET NULL` borraría en silencio **quién revocó un rol**,
   justo el dato que la auditoría existe para conservar (P-07).
4. **Los punteros de auditoría son llaves foráneas reales** (`granted_by_id`, `revoked_by_id`,
   `delegator_id`, `delegate_id`): un puntero a una cuenta inexistente haría inútil el registro
   precisamente cuando se necesita.

### Hallazgo importante: el generador de `down.sql` estaba mal

Al automatizar la generación del `down` se descubrió que compararlo contra el **esquema actual**
produce un `down` que deshace también las migraciones **posteriores**: el `down` de T-001 salía
borrando las tablas de T-002, y encadenar reversiones habría fallado al borrar algo ya borrado.
Corregido reconstruyendo ambos extremos del diff desde las carpetas de migración, y encapsulado
en `scripts/down-sql.sh` (`pnpm db:down-sql`) para que no dependa de que alguien recuerde el
detalle. Un `down` sólo se ejerce el día del rollback, que es el peor momento para descubrirlo.

### Pendiente declarado

- Igual que T-001: verificado con prueba de humo **manual y desechable**. Los 14 chequeos de
  invariantes de esta tarea **no están protegidos contra regresión** hasta que existan los tests
  de integración (T-030 en adelante). Deuda conocida y acotada.
- `person_organization.organization_id` sigue sin llave foránea porque la tabla `organization`
  la crea el **módulo 020**. Anotado como entregable de 020 en el propio `schema.prisma`: hasta
  entonces nada impide una fila apuntando a una organización inexistente, y eso toca P-05.
