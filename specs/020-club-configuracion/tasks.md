# TASKS-020 — Club, organizaciones, temporadas y configuración

> Cada tarea: una sesión, un commit (`docs/10-operating-manual-solo.md` §2).
> Si una tarea, al hacerla, resulta tocar más de 5 archivos o 400 líneas de diff: detente y
> avisa — la tarea estaba mal partida (`docs/10` §2). Pasó tres veces en `specs/010` y las tres
> veces la tarea partida quedó mejor.

**Numeración `T-2XX`**, no `T-0XX` como en `specs/010`: los mensajes de commit citan la tarea por
su número y dos módulos con `T-021` harían ambiguo el historial.

## A — Esquema y migraciones

- [x] **T-201** Modelos `Club`, `Organization`, `Season`, `Setting` (`plan.md` §1) con sus
  invariantes en SQL crudo: patrón del `slug`, coherencia `scope`/`scope_id`, `ends_on >=
  starts_on`, y el `EXCLUDE` sobre `(club_id, daterange(starts_on, ends_on, '[]'))` que impide
  temporadas solapadas (R-020-06), previa creación de `btree_gist`.
  Verificación: cada invariante probado **provocando su rechazo**, no asumiéndolo; migración `up`
  y `down` contra Postgres real. ✅ 2026-08-11 — 24 tests de integración, ver `verification.md`
  §T-201.
  > Apareció un invariante que el plan no había previsto: el índice único de `setting` **no
  > protegía el ámbito de plataforma**, porque ahí `scope_id` es NULL y PostgreSQL considera
  > distintos dos NULL. Se cubrió con un índice parcial. Y de paso hubo que reparar
  > `pnpm db:down-sql`, cuyos temporales rompían `migrate deploy`.

- [x] **T-202** Llaves foráneas pendientes de `specs/010` hacia `club` y `organization`
  (`plan.md` §6). **Incluye migrar los datos existentes**, no sólo agregar la restricción: hoy el
  seed y los tests inventan `club_id` libremente y la migración fallaría en una base con datos.
  Decisión explícita y escrita sobre `audit_log`: lleva llave foránea o no lleva, y por qué —
  es append-only por triggers, así que una migración que actualice sus filas **falla**.
  Verificación: la migración corre contra una base **con el seed aplicado**, no vacía; insertar
  una fila con `club_id` inexistente es rechazado. ✅ 2026-08-11 — 8 tests nuevos, ver
  `verification.md` §T-202.
  > **Tocó 12 archivos, muy por encima del límite de 5, y no se podía partir**: la restricción
  > rompía de golpe el seed y 21 tests que inventaban `club_id`. Dejar el commit rojo no era
  > opción, así que la tarea absorbió el `club` del seed (parte de T-203) y un ayudante
  > `crearClubDePrueba` para los tests. Decisión sobre `audit_log`: **sí lleva** llave foránea, y
  > la migración repara los datos creando clubes en vez de actualizar filas, que es lo que lo hace
  > posible.

- [x] **T-203** El seed (`pnpm db:seed`) crea también la **organización** y la **temporada
  abierta** del club de ejemplo. El `club` en sí ya lo crea desde T-202, que tuvo que adelantarlo
  para no dejar el seed roto; las categorías ya existían desde T-006. ✅ 2026-08-11 — 2 tests nuevos, ver `verification.md`
  §T-203.
  > Se agregó además el vínculo `person_organization` de las tres personas: sin ningún vínculo, un
  > administrador de organización no tiene sobre qué actuar y R-010-04 no se puede probar con
  > datos reales. Verificación: sigue siendo idempotente
  (`test/integration/seed.int-spec.ts` ya lo comprueba) y ahora satisface las llaves foráneas.

## B — Dominio puro (`packages/domain`)

- [x] **T-210** `isValidSlug` / `normalizeSlug`: minúsculas, `[a-z0-9-]`, sin guion al principio ni
  al final, longitud acotada. Tests: los casos válidos, y explícitamente mayúsculas, punto,
  espacio, guion bajo, cadena vacía y un slug de 300 caracteres. ✅ 2026-08-11 — 29 tests de
  dominio + 2 de integración, ver `verification.md` §T-210.
  > Dos cosas que no estaban en la tarea: una **lista de subdominios reservados** (`www`, `api`,
  > `admin`…), porque un club en `api` no falla, **funciona**, y queda accesible desde donde no
  > debe; y dos tests de integración que comparan la regla del dominio contra el `CHECK` de la
  > base, que es lo que impide que la aplicación acepte algo que la base rechaza.

- [x] **T-211** `resolveTenant(host, clubs)` (`specs/140` §9): extrae el subdominio de un host y
  devuelve el club activo o un fallo. Tests: host con puerto, host con mayúsculas, dominio raíz sin
  subdominio, `www`, subdominio desconocido, club suspendido, y host malformado. **Ninguna
  variante puede devolver un club distinto del que corresponde**: es la función de la que depende
  P-05 entero. ✅ 2026-08-11 — 18 tests, ver `verification.md` §T-211.
  > La firma lleva el **dominio base** de la instalación, que `specs/140` §9 no preveía: sin él,
  > `polo.app` sería el club «polo». Corregido allá. Y el subdominio de más nivel
  > (`a.lospinos.polo.app`) **no se recorta**: recortarlo serviría un club desde una dirección
  > que no es la suya, con las cookies de sesión viajando hasta ahí.

- [x] **T-212** Catálogo de configuración tipado (`plan.md` §0): clave → ámbito, tipo, valor por
  defecto y fuente documental. Se cargan las claves de `docs/08` que corresponden a módulos ya
  escritos o transversales; las de módulos futuros las agrega cada módulo. Verificación: un test
  recorre el catálogo y exige que toda clave tenga ámbito, tipo y default, y que no haya
  duplicados. ✅ 2026-08-11 — 19 tests, ver `verification.md` §T-212.
  > El ámbito declarado es el **más específico** en el que se puede fijar la clave: fijarla en uno
  > más amplio siempre se puede (la plataforma define el default de todos), en uno más específico
  > no. Y `auth.session_idle_timeout_hours` quedó en `null` —sin cierre por inactividad—, que es lo
  > que el sistema hace hoy: poner un número anunciaría un comportamiento inexistente.

- [x] **T-213** `resolveSetting`: dada la lista de valores fijados y un instante, resuelve el
  vigente siguiendo organización → club → plataforma → default (R-020-10) e informa **de dónde
  salió** (explícito, heredado, default). Tests: los cuatro niveles, un valor con vigencia futura
  que todavía no rige, dos valores del mismo ámbito con vigencias distintas, y la consulta sobre
  una fecha pasada (HU-020-08). ✅ 2026-08-11 — 19 tests, ver `verification.md` §T-213.
  > «Explícito» resultó depender de **quién pregunta**, no sólo de dónde está el dato: el mismo
  > valor de club es explícito visto desde el club y heredado visto desde una organización.
  > **Con esto cierra la sección B**; sigue T-220/T-221, el `TenantGuard`.

## C — El tenant en la aplicación

- [ ] **T-220** `ClubRepository` + caché en memoria del proceso con TTL (`docs/06` §1, ADR-012) e
  **invalidación explícita**. Verificación: dos lecturas seguidas hacen una sola consulta; tras
  invalidar, vuelve a consultar.

- [ ] **T-221** `TenantGuard` — **cierra `T-020` de `specs/010`**. Resuelve el club por host antes
  que cualquier otro guard, `404` para host desconocido, suspendido o malformado, sin distinguir
  entre ellos (R-020-02). Verificación: host desconocido → `404` **sin consultar la tabla de
  usuarios**; y el test de dos clubes simultáneos que exige que ninguno vea al otro.

- [ ] **T-222** Permisos nuevos en `hasPermission` y en la matriz de `docs/06` §4: `club.edit`,
  `organization.manage`, `season.manage`, `membership.manage`, `setting.edit`,
  `platform.club.manage`. `membership.manage` y `setting.edit` son las dos filas de `docs/06` que
  T-022a dejó sin nombre canónico. Verificación: los tests de propiedad de T-022a siguen pasando
  con el catálogo ampliado — ningún rol operativo gana autoridad.

- [ ] **T-223** Resolvedor de ámbito de organización en `PermissionGuard` (pendiente declarado de
  T-022b): una ruta puede indicar de dónde sale la organización objetivo. Verificación: un
  `organization_admin` pasa en la suya y es rechazado en otra, por la misma ruta.

## D — Plataforma (superadministrador)

- [ ] **T-230** `POST /platform/clubs`: alta con nombre, slug, zona horaria y moneda; crea la
  temporada abierta y las categorías por defecto; invita al primer administrador. Verificación:
  contrato, camino feliz, slug duplicado, slug inválido, zona horaria inexistente, y rol no
  autorizado.

- [ ] **T-231** `POST /platform/clubs/:id/suspend` y `/reactivate`. Suspender **corta el acceso de
  inmediato** (R-020-04): invalida la caché y revoca las sesiones activas del club. Verificación:
  suspender y pedir en la misma prueba → `404`; reactivar → vuelve a funcionar.

- [ ] **T-232** Script de arranque (`pnpm bootstrap:club`, HU-020-03): crea el primer club, su
  administrador y el superadministrador. Verificación: correrlo dos veces no duplica nada y avisa;
  y un test confirma que **no existe ninguna ruta HTTP** que haga esto.

## E — Club, organizaciones, temporadas, categorías

- [ ] **T-240** `GET /clubs/current/public` (sin sesión, sólo nombre y zona horaria — HU-020-09) y
  `GET`/`PATCH /clubs/current` (con `club.edit`). Verificación: la respuesta pública se compara
  **campo por campo** contra la lista permitida; agregar un campo nuevo rompe el test a propósito.

- [ ] **T-241** Organizaciones: crear, editar, listar, archivar (nunca borrar). Verificación:
  aislamiento — un administrador de otro club recibe `404`; archivar conserva la historia.

- [ ] **T-242** Temporadas: crear, listar, cerrar. Cerrar exige que no queden prácticas ni copas
  abiertas (cuando existan; hoy la comprobación queda declarada y vacía). Verificación: crear una
  temporada solapada es rechazado **por la base**, no sólo por el servicio.

- [ ] **T-243** Categorías de membresía: crear, editar, desactivar. Verificación: cambiar la cuota
  no altera cobros ya emitidos (hoy sin módulo de pagos: se prueba que el valor histórico se
  conserva); una categoría en uso no se puede eliminar.

## F — Configuración

- [ ] **T-250** `GET /settings?scope=…`: valores vigentes con su origen (explícito, heredado,
  default). Verificación: los cuatro niveles de herencia, vistos desde la API.

- [ ] **T-251** `PUT /settings/:key`: fija un valor con su vigencia, validado contra el catálogo
  (R-020-09). Verificación: clave desconocida → rechazada; tipo equivocado → rechazado **al
  escribir**; el valor anterior sigue consultable.

- [ ] **T-252** `GET /settings/:key/history` y consulta por fecha. Verificación: «qué regía el 3 de
  marzo» devuelve el valor de entonces, no el de hoy.

- [ ] **T-253** Auditoría de configuración: cada cambio deja **exactamente una** fila con el valor
  anterior y el nuevo (R-020-12, mismo criterio que T-023).

## G — Cierre de módulo

- [ ] **T-260** E2E: crear un club nuevo, entrar por su subdominio, configurarlo y dejarlo
  operativo. Es la medida de HU-020-02 («horas, no días»).

- [ ] **T-261** `pnpm check:isolation` cubre las rutas nuevas: dos clubes simultáneos, ninguna ruta
  filtra nada del otro.

- [ ] **T-262** `verification.md`: cada criterio de aceptación de `spec.md` §12 con su test
  (archivo + nombre). Cualquier criterio sin test identificado se resuelve antes de cerrar.

- [ ] **T-263** Demostración en staging desde un celular real (`docs/10` §3): club nuevo creado y
  operativo, y el club de Los Pinos funcionando por su subdominio.

## Orden sugerido y por qué

`T-201` → `T-202` → `T-210`/`T-211` → `T-220`/`T-221` desbloquea lo más valioso primero: con el
`TenantGuard` funcionando, las piezas de `specs/010` que hoy dependen de un `req.tenant` que nadie
llena dejan de estar a medias, y la sección D de 010 (login) se puede retomar sin deuda.

`T-232` (arranque) conviene temprano: es lo que permite tener un club real en desarrollo y dejar de
inventar identificadores en cada test.
