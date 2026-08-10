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

---

## T-003 — `MembershipCategory`, `MembershipAssignment`, `Guardianship`

**Fecha:** 2026-08-10 · **Migración:** `20260810210251_identity_membership_and_guardianship`

### Verificación exigida por la tarea

| Criterio | Resultado |
|---|---|
| Migración `up`/`down` contra Postgres real | ✅ ciclo completo; el `down` revierte sólo T-003 y el `EXCLUDE` se reconstruye al volver a aplicar |

### El primer dinero del proyecto (P-02), demostrado

`membership_category.monthly_fee_cents` es el primer campo de dinero. Quedó `BIGINT` en la base
y `BigInt` en el cliente. La prueba no se quedó en «funciona con una cuota normal»:

| Comprobación | Resultado |
|---|---|
| Cuota realista (1.500.000 COP = 150.000.000 centavos) vuelve exacta y como `BigInt` | ✅ |
| Un valor por encima de 2⁵³ (`9007199254740993`) **no pierde precisión** | ✅ |
| …y el mismo test demuestra que en punto flotante ese número y su vecino **son el mismo valor** (`9007199254740992`) | ✅ |
| Cuota de cero es válida (hay categorías sin cuota) | ✅ |
| Cuota negativa es rechazada | ✅ |

Esa tercera línea es la razón de existir de P-02, hecha evidencia ejecutable en lugar de
argumento: si el dinero pasara por un `number` de JavaScript, dos cifras distintas de centavos
serían indistinguibles.

### La regla de producto del PRD §2, vuelta imposible de violar

*«Cada persona tiene una única categoría vigente a la vez, pero la plataforma guarda el
historial»* dejó de ser una intención y pasó a ser un `EXCLUDE USING gist` sobre
`(person_id, daterange(effective_from, effective_to, '[)'))`:

| Comprobación | Resultado |
|---|---|
| Dos categorías con períodos solapados para la misma persona | ✅ rechazado por la base |
| Abrir una segunda membresía mientras hay una vigente sin cerrar | ✅ rechazado |
| Cambio de categoría el mismo día en que termina la anterior | ✅ **permitido** — el rango semiabierto `'[)'` hace válido el caso normal |
| Una membresía que termina antes de empezar | ✅ rechazado |

Vale la pena notar el tercer caso: un constraint que rechazara también los períodos adyacentes
habría hecho imposible el cambio de categoría normal. El invariante correcto no es «que no se
toquen», es «que no se solapen».

### Cuentas familiares (R-010-10)

| Comprobación | Resultado |
|---|---|
| Un menor con **dos** acudientes (madre y padre) | ✅ permitido |
| Dos pagadores principales vigentes para el mismo menor | ✅ rechazado |
| El mismo acudiente vinculado dos veces al mismo menor | ✅ rechazado |
| Nadie es acudiente de sí mismo | ✅ rechazado |
| Vínculo que termina antes de empezar | ✅ rechazado |

**División honesta de la garantía:** la base asegura «**como máximo** un pagador principal
vigente». El «**al menos** uno» depende de la fecha y no cabe en un constraint — lo vigila el job
diario de integridad (T-071). Media garantía está en el motor y media en la aplicación, y eso
queda escrito para que nadie asuma más de lo que hay.

### Decisiones de modelado

1. **`code` de categoría es texto, no un enum.** Las categorías son un catálogo administrable
   (P-04, PRD §16): el club puede crear las suyas sin que nadie despliegue. Un enum las habría
   congelado en el código.
2. **`monthly_fee_cents` es el valor vigente, no un histórico.** Los importes ya cobrados se
   congelan en `charge.amount_cents` (módulo 100), así que cambiar la cuota no reescribe el
   pasado. Se documentó en el esquema para que nadie añada una tabla de histórico creyendo que
   falta.
3. **`effective_from`/`effective_to` y `starts_on`/`ends_on` son `DATE`, no timestamps.** Un
   cambio de categoría «aplica desde el siguiente ciclo de facturación»: eso es un día, no un
   momento del día.
4. **`btree_gist` se crea aquí** y el `down` **no** la elimina a propósito: es una capacidad del
   motor, no un dato de este módulo, y los módulos 040 (canchas) y 090 (caballos) la necesitan
   para su propio antidoble-reserva.

### Pendiente declarado

- Igual que T-001 y T-002: los 17 chequeos son una prueba de humo **manual y desechable**. Sin
  protección contra regresión hasta los tests de integración (T-030 en adelante).
- `membership_category.rights` es `jsonb` sin validación de forma en la base. La estructura la
  debe validar el dominio (Zod) cuando se implemente la gestión de categorías; hoy nada impide
  guardar una clave mal escrita.

---

## T-004 — `WaiverVersion`, `WaiverAcceptance`, `AuditLog` (append-only)

**Fecha:** 2026-08-10 · **Migración:** `20260810211235_identity_waivers_and_audit_log`

### La tarea se partió al ejecutarla, y por qué

`tasks.md` pedía `REVOKE UPDATE, DELETE ... para el rol de aplicación`. Al ir a hacerlo apareció
un problema de fondo: **la aplicación se conecta con un rol que es superusuario y dueño de la
tabla**, y en PostgreSQL tanto el superusuario como el dueño saltan toda comprobación de
permisos. Ese `REVOKE` habría sido código que parece proteger y no protege — una garantía falsa,
que es peor que ninguna, porque nadie la vuelve a revisar.

Se implementó con **triggers**, que sí aplican a todo el mundo. El `REVOKE` sigue siendo deseable
como segunda capa y quedó como **T-007**, porque crear un rol sin privilegios toca
`docker-compose`, `.env`, el despliegue y el CI — más de lo que cabe en una tarea.

### Append-only, verificado en la forma más fuerte posible

Las tres operaciones se probaron **conectado como el superusuario** (`polo`, `usesuper = t`):

| Operación | Resultado |
|---|---|
| `INSERT` | ✅ permitido (es el único camino de escritura) |
| `SELECT` | ✅ permitido |
| `UPDATE` | ✅ **rechazado** — `audit_log es append-only: la operacion UPDATE no esta permitida (constitution P-07)` |
| `DELETE` | ✅ **rechazado** |
| `TRUNCATE` | ✅ **rechazado** |
| La fila, tras los tres intentos | ✅ intacta y sin alterar |

Y desde la aplicación (Prisma), los mismos tres caminos fallan, incluido `deleteMany`.

**`TRUNCATE` necesitaba su propio trigger.** No dispara los de `DELETE`: sin esa tercera línea,
un solo `TRUNCATE audit_log` habría vaciado la auditoría entera sin encontrar resistencia. Es
justamente la operación que alguien usaría para «limpiar».

### Waivers (HU-010-11)

| Comprobación | Resultado |
|---|---|
| Publicar la versión 1 y luego la 2, cada una con su texto | ✅ la 2 no sobreescribe la 1 |
| Repetir el número de versión dentro del mismo club | ✅ rechazado |
| Versión cero o negativa | ✅ rechazado |
| Una persona adulta acepta por sí misma | ✅ |
| La misma persona acepta dos veces la misma versión | ✅ rechazado |
| **El acudiente acepta en nombre del menor** (`person_id` ≠ `accepted_by_person_id`) | ✅ permitido |
| La misma persona con aceptaciones de versiones distintas | ✅ permitido — eso es el historial |

`body` guarda el texto completo, no una referencia a un archivo: si en 2029 se discute qué se
aceptó en 2026, la respuesta tiene que ser ese texto exacto y no el vigente.

### Auditoría: dos casos de modelado que importan

1. **`club_id` es nulable.** Una acción de alcance de plataforma (crear un club) no cuelga de
   ningún club. Verificado que se puede auditar con `club_id = NULL`. La capa de repositorio
   debe tratar ese NULL explícitamente: esas filas sólo las ve un superadministrador.
2. **`entity_id` no tiene llave foránea, a propósito.** Es polimórfico: la auditoría cubre
   cualquier entidad del sistema y debe sobrevivir aunque la entidad ya no exista. `actor_user_id`
   y `on_behalf_of_id` **sí** son llaves foráneas con `Restrict`, por la misma razón que en
   T-002: un puntero roto haría inútil el registro justo cuando se necesita.

### Límites honestos de la garantía

- **Protege datos, no DDL.** `DROP TABLE` sí funciona — verificado al probar el `down`. Es
  deliberado: revertir una migración es un acto administrativo explícito, no manipulación de
  datos. La auditoría no puede editarse; el esquema sí puede revertirse.
- **Tensión pendiente con la Ley 1581.** `docs/06` §8 exige poder anonimizar datos personales a
  solicitud del titular, pero `before`/`after` pueden contener nombre o correo y hoy son
  inmodificables. Ese flujo necesitará una vía privilegiada y auditada de redacción cuando se
  construya. Se dejó **declarado** y no se debilitó el trigger por adelantado.
- **Los tests que escriban en `audit_log` no pueden limpiar lo que escribieron.** Necesitan base
  de datos nueva por corrida (Testcontainers), no limpieza posterior. Afecta a T-081.
- Tras un `down`, la función `audit_log_append_only()` queda en la base sin sus triggers.
  Inofensivo e idempotente (`CREATE OR REPLACE`); documentado en `docs/05` §6 como límite
  conocido del generador de `down.sql`.

### Pendiente declarado

- Los 15 chequeos son, otra vez, prueba de humo **manual y desechable**. La red contra regresión
  llega con T-081 (test que verifica que cada acción auditable deja exactamente una fila).

---

## T-005 — Unicidad del correo, y el primer test automatizado del proyecto

**Fecha:** 2026-08-10

### Lo que se verificó (ya no a mano)

Primer test que corre solo y falla si alguien rompe el comportamiento:
`apps/api/test/integration/person-email.int-spec.ts`, 4 tests, contra PostgreSQL 16 real.

| Test | Qué fija |
|---|---|
| Dos personas del mismo club con correo vacío | Conviven — los `NULL` son distintos entre sí |
| Dos personas del mismo club con el mismo correo | Rechazado (`P2002`) |
| El mismo correo en dos clubes distintos | Permitido — `person.email` es único **por club** |
| El mismo correo de **acceso** en dos clubes | Rechazado — `user_account.email` es único **global** (`docs/09` D-05) |

Los dos últimos existen para fijar una distinción que es fácil de confundir y romper: el correo
*de contacto* de una persona y el correo *de acceso* de su cuenta son datos distintos con reglas
distintas.

### La tarea arrastró el andamiaje de pruebas de integración

Era el primer test de integración del proyecto, así que hubo que montarlo: `test/global-setup.ts`
levanta un PostgreSQL 16 con Testcontainers y le aplica las migraciones; `test/db.ts` entrega el
cliente. Se corre con `pnpm test:int` y está en el CI.

**Decisión de aislamiento, forzada por T-004.** Un contenedor por corrida (arrancar Postgres
cuesta ~15 s) y los tests **etiquetan sus datos** con un `clubId` único en vez de limpiar entre
tests. No es preferencia de estilo: `audit_log` es append-only, así que un test que escriba ahí no
puede borrar lo que escribió, ni con `DELETE` ni con `TRUNCATE`. El patrón habitual de «limpiar
entre tests» simplemente no funciona en este esquema, y descubrirlo ahora evita construir la suite
entera sobre una base equivocada.

### Bug latente encontrado: la API no arrancaba

Al hacer que `typecheck` y ESLint cubrieran también `test/`, salió un problema de la Fase 0 que
nada había detectado hasta ahora: **`apps/api` compilaba a CommonJS mientras su `package.json`
declaraba `"type": "module"`**. Consecuencia:

```
node dist/main.js
→ ReferenceError: exports is not defined in ES module scope
```

El `build` pasaba, el CI habría pasado, y **la API nunca había corrido**. Es el caso de libro de
«verde en CI, roto en producción»: ningún gate lo cubría porque ninguno arrancaba el proceso.

Corregido pasando `apps/api` a ESM de verdad (coherente con `packages/domain`, `packages/contracts`
y `apps/web`, todos ESM), con `tsconfig.json` para desarrollo/lint (incluye `src` + `test`, no
emite) y `tsconfig.build.json` para el build (sólo `src`). Verificado como debe verificarse:
arrancando el proceso y pidiéndole las dos rutas.

```
GET /health → HTTP 200 {"status":"ok"}
GET /ready  → HTTP 200 {"status":"ok"}
```

> **Lección para los gates.** Compilar no es correr. Falta un gate que arranque el proceso y le
> pida `/health` — hoy eso lo cubriría el paso de E2E, que todavía no tiene contenido real. Queda
> anotado como pendiente de la suite de E2E (T-100 en adelante).

---

## T-006 — Datos de ejemplo (`pnpm db:seed`)

**Fecha:** 2026-08-10

### Qué siembra

Un **club ficticio** (`club-demo`): 5 categorías de membresía del catálogo estándar, la versión 1
del waiver, y 3 personas con cuenta activa y un rol distinto cada una (`club_admin`,
`commissioner`, `player`), cada una con su membresía vigente.

Nada se llama Los Pinos ni Cuatro Soles, y ninguna tarifa es real. Es deliberado: la plataforma es
un producto para clubes de polo, y hardcodear el cliente cero es el primer paso para no poder
venderla (CLAUDE.md, contexto de negocio). Los datos reales entran por la interfaz de
administración.

### Idempotencia: automatizada, no verificada a mano

| Comprobación | Resultado |
|---|---|
| Tras la primera corrida | 3 personas, 3 cuentas, 3 roles, 5 categorías, 3 membresías, 1 waiver |
| Tras la segunda corrida | **exactamente los mismos conteos** |
| Los tres roles son distintos y las tres cuentas quedan `active` | ✅ |

Está en `test/integration/seed.int-spec.ts` (3 tests). Para poder escribirlo, el seed expone
`sembrarClubDemo(prisma)` y recibe el cliente en vez de crearlo — así el test lo llama dos veces
contra su propia base. Sin ese cambio, la única verificación posible habría sido manual, que es
justo la deuda que este módulo lleva arrastrando.

**Cómo se logra la idempotencia**, que no es trivial con ids aleatorios (UUID v7):
- Donde hay una clave natural única, `upsert`: categorías por `(club_id, code)`, waiver por
  `(club_id, version)`, persona por `(club_id, email)`, cuenta por `email`.
- Donde la unicidad real es un **índice parcial** o un `EXCLUDE` (roles y membresías, T-002 y
  T-003), `upsert` no sirve porque Prisma no sabe apuntar a esos constraints: se busca primero y
  se crea sólo si falta.
- El hash de contraseña **no** se reescribe en cada corrida: si alguien la cambió en desarrollo,
  el seed no debería deshacerlo.

### Detalles con intención

1. **El primer administrador se otorga el rol a sí mismo** (`grantedById` = su propia cuenta).
   No es un atajo: por definición no hay nadie antes del primer administrador. De ahí en adelante,
   quien otorga siempre es otra cuenta.
2. **El seed se niega a correr con `NODE_ENV=production`** salvo que se le pase
   `SEED_ALLOW_PRODUCTION=true`. Crea cuentas con una contraseña conocida; que eso llegue a
   producción por accidente es un incidente de seguridad, no una molestia.
3. **`prisma/` entró en `typecheck` y en ESLint.** `docs/05` §8 dice que un seed desactualizado
   respecto al esquema es un bug; ahora el compilador lo detecta en vez de que aparezca la próxima
   vez que alguien lo corra.
4. **Primer uso real de Argon2id**, verificado: el hash guardado valida la contraseña correcta,
   rechaza la incorrecta, y el algoritmo es `argon2id` (no `argon2i` ni `argon2d`).

---

## T-010 — Primera regla de dominio: quién puede iniciar sesión

**Fecha:** 2026-08-10 · 10 tests en `packages/domain/src/identity/__tests__/login.spec.ts`

### La barrera que protegía el dominio no protegía nada

Antes de escribir la primera regla se comprobó lo obvio: que `check:arch` detecte un import
prohibido. **No lo detectaba.** Se agregó a propósito un `import type { UserAccountStatus } from
"@prisma/client"` dentro de `packages/domain` y el gate pasó en verde. El proyecto llevaba cuatro
tareas creyendo que P-01 estaba protegido automáticamente.

Dos causas, la segunda peor que la primera:

1. Con pnpm la ruta real de un paquete es
   `node_modules/.pnpm/@prisma+client@X/node_modules/@prisma/client`, así que un patrón anclado
   con `^node_modules/` nunca casa.
2. Como pnpm **aísla** las dependencias, `@prisma/client` no se puede resolver desde
   `packages/domain`: dependency-cruiser lo reporta con tipo `unknown` y sin ruta en disco. Ninguna
   regla basada en el nombre resuelto o en el tipo de dependencia lo iba a ver.

**Corregido invirtiendo la regla: en vez de enumerar lo prohibido, se declara lo permitido.** El
dominio sólo puede importar archivos de `packages/domain/src`; cualquier otra cosa —npm, otro
paquete del workspace, una app, un módulo de Node— es error. Así no depende de cómo se resuelva
nada, y atrapa también el próximo paquete que a alguien le parezca inofensivo. Se agregó además una
regla que convierte **cualquier import no resoluble** en error de build.

Verificado en los dos sentidos: con el import prohibido presente el gate falla con 2 errores; sin
él, pasa. Es el mismo patrón de fallo que el `REVOKE` de T-004: código que parece proteger y no
protege.

### La regla, y por qué el orden es parte de ella

| Test | Qué fija |
|---|---|
| Cuenta activa + contraseña correcta | Entra |
| Contraseña incorrecta en cuenta activa | Error genérico |
| **Contraseña incorrecta en cuenta suspendida** | Error genérico — **no revela la suspensión** |
| **Los 4 estados con contraseña incorrecta** | **Respuesta idéntica**, un solo valor distinto en el conjunto |
| Cuenta suspendida + contraseña correcta | Motivo `suspended` (mensaje útil para su titular) |
| Cuenta archivada + contraseña correcta | Motivo `archived` |
| Cuenta invitada + contraseña correcta | Motivo `invitation_pending` |
| Ningún estado salvo `active` entra, ni con la contraseña correcta | ✅ |

El cuarto test es el que importa de verdad: comprueba que **sin la contraseña correcta los cuatro
estados son indistinguibles entre sí**. Ésa es la propiedad que impide enumerar cuentas, y está
escrita como propiedad y no como cuatro comparaciones sueltas.

### Aclaración de spec (cambia lo que ve el usuario)

El PRD Parte II §5 pide que una cuenta invitada, suspendida o archivada reciba «un mensaje acorde a
su estado», sin decir **en qué momento**. Tomado literalmente, cualquiera podría escribir un correo
y averiguar si tiene cuenta y si está suspendida: enumeración de cuentas más fuga del estado de un
tercero (P-12).

La regla quedó: **primero la contraseña, después el estado.** El titular legítimo sigue recibiendo
su mensaje útil; quien prueba correos no recibe nada. `spec.md` HU-010-04 y R-010-07 se
actualizaron para que no quede ambiguo, y el orden vive dentro de `resolveLoginOutcome` — no en el
controlador, donde una fuga quedaría a un despiste de distancia.

Consecuencia práctica declarada: una cuenta `invited` no tiene contraseña usable, así que en la
vida real siempre caerá por el camino genérico. Para esa persona el camino correcto es reenviar la
invitación (T-053), no un mensaje en la pantalla de ingreso.

### Decisiones que fijan el patrón para el resto del dominio

1. **El dominio tiene su propio vocabulario.** `AccountStatus` se define en
   `packages/domain/src/identity/accountStatus.ts` en vez de importar el enum de Prisma. Cuatro
   palabras duplicadas a cambio de poder probar las reglas del polo sin base de datos, y de que
   cambiar de ORM no toque ninguna regla de negocio.
2. **El dominio no hashea ni compara contraseñas.** Recibe `credentialsValid: boolean`, un
   veredicto ya tomado. Argon2id es una librería, y el dominio no tiene dependencias.
3. **Exhaustividad forzada por el compilador.** El `switch` sobre el estado termina en un
   `never`: si algún día se agrega un estado y nadie lo piensa, el build se rompe en vez de
   dejarlo permitido —o prohibido— por accidente.
4. **El plan se corrigió, no se ignoró.** Preveía sólo un booleano; se anotó en `plan.md` por qué
   resultó insuficiente para su propio spec.

---

## T-011 — `canAssignRole`: quién puede otorgar qué rol

**Fecha:** 2026-08-10 · 27 tests · dominio al 100 % de cobertura

Es la función más delicada del módulo: un error aquí no es un bug de permisos, es una **escalada de
privilegios**. Por eso tiene más tests que código y decide únicamente sobre datos explícitos.

### La ambigüedad que había que resolver antes de escribir nada

Dos documentos del propio repositorio se contradecían sobre si un `organization_admin` puede
nombrar a **otro** `organization_admin`:

| Fuente | Qué decía |
|---|---|
| `docs/06` §4 | `organization_admin` es «otorgado por `superadmin` o `club_admin`» → **no puede** |
| `spec.md` R-010-04 | «`organization_admin` sólo otorga roles dentro de su propia organización» → leído literalmente, **sí puede** |

**Resuelto por el lado del menor privilegio.** Si un administrador de organización pudiera
clonarse, una sola cuenta comprometida se multiplica sin que ningún administrador del club se
entere, y el club pierde la capacidad de saber quién manda en sus organizaciones. El costo es que
los nombra el club: con una o dos organizaciones, un trámite de un minuto.

Quedó escrito en `spec.md` R-010-04 y en `docs/06` §4, marcado como **decisión revisable** si en la
operación real resulta incómoda — relajarla es una línea y su test.

### Los casos del spec

| Test | Resultado |
|---|---|
| Administrador de organización intenta otorgar `commissioner` | ✅ rechazado |
| Administrador de organización intenta otorgar `club_admin` | ✅ rechazado |
| Administrador de club intenta otorgar en una organización de **otro** club | ✅ rechazado |
| Administrador de club intenta otorgar en **otro** club | ✅ rechazado |
| Administrador de organización intenta otorgar en **otra** organización | ✅ rechazado |
| Administrador de club otorga `commissioner` en su club | ✅ permitido |
| Administrador de organización otorga `instructor` y `groom` en la suya | ✅ permitido |
| Sólo un `superadmin` puede crear otro `superadmin` | ✅ |

### Tres reglas que no eran obvias y quedaron probadas

1. **Tener un rol no es poder repartirlo.** El **comisario** —máxima autoridad deportiva— no
   otorga ningún rol: su autoridad es sobre handicaps, equipos y resultados, no administrativa.
   Está probado explícitamente para que nadie lo lea como un olvido y lo «arregle».
2. **Los permisos se acumulan, pero acumular no crea autoridad** (R-010-03). Quien es jugador *y*
   administrador del club otorga como administrador; quien es jugador *y* comisario sigue sin poder
   otorgar nada. Dos tests, uno por cada mitad de la regla.
3. **Un rol sólo existe en su ámbito.** Un «comisario de organización» o un «superadministrador de
   club» se rechazan como **datos incoherentes** (`rol_no_admite_ese_ambito`), no como falta de
   permisos — distinguirlo importa porque son bugs distintos. `treasurer` es el único rol válido en
   dos ámbitos, y hay un test que lo comprueba recorriendo la tabla, así que si mañana alguien
   agrega otro rol de doble ámbito, se enterará.

### Dos tests que comprueban propiedades, no casos

Los más valiosos del conjunto, porque cubren combinaciones que nadie enumeró a mano:

- **«Sólo tres tipos de actor pueden otorgar algo, en algún ámbito»**: recorre los 8 roles × sus
  ámbitos válidos × 6 tipos de actor, y verifica que la lista de quienes tienen *alguna* autoridad
  es exactamente `superadmin`, `club_admin` y `organization_admin`. Si un rol ganara autoridad por
  accidente, aparece aquí.
- **«Ningún actor puede otorgar un rol en un club que no es el suyo»**: barre todos los roles de
  ámbito de club contra un club ajeno y exige que la lista de infractores esté vacía. Es la
  propiedad de aislamiento entre clubes (P-05) aplicada a los permisos.

### Datos incoherentes se rechazan antes de evaluar permisos

Cuatro tests cubren el borde: ámbito de plataforma con identificador concreto, ámbito de club sin
identificador, un rol de club cuyo club no coincide con su propio ámbito, y un rol de organización
sin saber a qué club pertenece. El último devuelve `club_del_ambito_desconocido` en vez de adivinar:
sin ese dato no hay forma de saber si un `club_admin` manda ahí, y **adivinar en una función de
permisos es exactamente cómo se abren los agujeros**.

### Pendiente declarado

- `R-010-05` (nadie se retira roles a sí mismo) **no** está aquí: es sobre *revocar*, no otorgar, y
  le corresponde a T-058 y T-061. Otorgarse un rol a uno mismo sí está permitido, y es lo que hace
  el seed con el primer administrador: por definición no hay nadie antes que él.
- `player` es el rol base que el sistema asigna al activarse una cuenta, no un otorgamiento
  discrecional. Esta función lo trata como el rol de club que es si alguien lo otorga a mano.
