# PLAN-030 — Handicaps

> Cómo se construye `spec.md`. Entidades, contratos, archivos y los puntos donde este módulo se
> puede equivocar en silencio.

## 0. La decisión de diseño de este módulo

En `specs/040` la decisión fue **dejar que PostgreSQL garantice lo imposible**. Aquí es otra:
**el historial es la tabla; el valor vigente es una caché.**

Se puede construir al revés —una columna `handicap_halves` en `person`, y una bitácora al lado que
se escribe «además»— y funciona hasta el primer camino de escritura que se olvida de la bitácora.
Ahí el historial deja de ser confiable, que es lo único que este módulo promete, y no hay forma de
saber cuándo empezó a mentir.

Por eso, tres consecuencias que atraviesan todo el plan:

1. **Un solo servicio escribe**, y escribe las dos tablas **en la misma transacción**. No hay ruta
   que actualice el vigente sin registrar el cambio.
2. **El vigente se puede reconstruir desde el historial**, y hay un test que lo hace: recalcula
   desde cero y compara. Si algún día divergen, ese test lo dice antes que un jugador.
3. **`handicap_history` no se actualiza ni se borra**, a nivel de base de datos y no de buena
   intención (constitución, regla 7).

## 1. Esquema de datos (Prisma)

```prisma
enum HandicapType {
  /// El oficial del jugador.
  international
  /// La versión del club, que suele moverse en pasos más finos.
  club
}

/// El valor vigente. **Es una denormalización**: la verdad está en `HandicapHistory` (R-030-10).
/// Existe para que consultar el handicap de 40 jugadores al armar equipos sea una consulta y no
/// cuarenta agregaciones sobre el historial.
model PlayerHandicap {
  id       String @id @default(uuid(7))
  clubId   String @map("club_id")
  personId String @map("person_id")

  type        HandicapType
  /// Medios goles enteros (constitución, regla 4). 1.5 goles → 3. Rango −4..20.
  valueHalves Int          @map("value_halves")

  updatedAt DateTime @updatedAt @map("updated_at")

  club   Club   @relation(fields: [clubId], references: [id])
  person Person @relation(fields: [personId], references: [id])

  /// Un solo vigente por persona y tipo. Es lo que hace que el `upsert` del servicio sea seguro
  /// aunque dos peticiones lleguen a la vez.
  @@unique([personId, type])
  @@index([clubId, type])
  @@map("player_handicap")
}

/// Append-only. La fuente de verdad.
model HandicapHistory {
  id       String @id @default(uuid(7))
  clubId   String @map("club_id")
  personId String @map("person_id")

  type           HandicapType
  previousHalves Int          @map("previous_halves")
  newHalves      Int          @map("new_halves")

  /// La cuenta que ejecutó el cambio. Siempre el comisario, hoy.
  changedById String  @map("changed_by_id")
  /// **Previsto y sin usar** hasta que exista la delegación en un subcomisario (`spec.md` §7).
  /// Se deja declarado porque es exactamente la columna que esa delegación va a necesitar, y
  /// agregarla después obliga a migrar una tabla que para entonces tendrá años de historia.
  onBehalfOfId String? @map("on_behalf_of_id")

  /// Obligatorio y no vacío (R-030-07). Un historial sin motivos no respalda ninguna decisión.
  reason String
  /// La temporada vigente al momento del cambio, si había alguna (R-030-12).
  seasonId String? @map("season_id")

  changedAt DateTime @default(now()) @map("changed_at")

  club   Club   @relation(fields: [clubId], references: [id])
  person Person @relation(fields: [personId], references: [id])
  season Season? @relation(fields: [seasonId], references: [id])

  /// El orden en que se lee: el historial de una persona, del más nuevo al más viejo.
  @@index([personId, type, changedAt(sort: Desc)])
  @@map("handicap_history")
}
```

### Lo que NO lleva el esquema, y por qué

- **Ninguna columna `effective_from`.** El cambio rige de inmediato (R-030-06). Agregarla «por si
  acaso» obligaría a que toda consulta del vigente respondiera «¿vigente cuándo?».
- **Ningún `CHECK` de rango en la base.** El rango −4..20 es una regla de polo y vive en
  `packages/domain` (constitución, P-01). Duplicarla en SQL crea dos verdades que se pueden
  desincronizar, y la de SQL no se puede probar sin base. La base garantiza lo que sólo ella puede:
  unicidad e integridad referencial.
- **Ninguna fila por defecto al crear una persona.** Ver §5.

## 2. La ausencia de fila como dato

R-030-05 dice que toda persona nace en −2 y que la diferencia entre «nunca calificado» y
«calificado en −2» la marca el historial. En el esquema eso se implementa **sin escribir nada al
crear una persona**:

| Estado | `player_handicap` | `handicap_history` | Qué devuelve el API |
|---|---|---|---|
| Nunca calificado | sin fila | sin filas | `−4` medios, `calificado: false` |
| Calificado en −2 | fila con `−4` | ≥ 1 fila | `−4` medios, `calificado: true` |

Las dos señales —fila ausente e historial vacío— **aparecen y desaparecen juntas**, porque el
servicio escribe las dos en la misma transacción. El API expone `calificado` explícito para que
050 no tenga que deducirlo, y para que nadie lo deduzca mal comparando el valor contra −4.

Evita además una migración de relleno sobre `person` y el riesgo de que una persona creada por un
camino que no conocemos quede sin sus dos filas.

## 3. Estructura de archivos

```
packages/domain/src/handicap/
  halves.ts              goalsToHalves, halvesToGoals, validarHandicap; el tipo HandicapHalves
  change.ts              planearCambioDeHandicap + RechazoDeCambio
  team.ts                handicapDelEquipo (lo consume 050)
  visibility.ts          puedeVerElHistorial (R-030-09)
  __tests__/

apps/api/src/handicaps/
  handicaps.service.ts   el ÚNICO escritor; la transacción de §5
  handicaps.controller.ts las cuatro rutas
  handicaps.module.ts

apps/web/src/features/handicaps/
  api/useHandicaps.ts
  (las pantallas se enganchan al perfil de persona que ya existe)
```

`halves.ts` no importa nada. `change.ts` importa sólo `halves.ts`. Es la parte del módulo que más
va a durar sin cambios, y no debe arrastrar dependencias.

## 4. Contratos clave (Zod)

```ts
/** El valor que viaja. En medios goles, entero — nunca 1.5. */
const HandicapValue = z.object({
  valueHalves: z.number().int().min(-4).max(20),
  /** ¿Alguien lo calificó alguna vez, o es el valor por defecto? (§2) */
  calificado: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
});

const PersonHandicapsResponse = z.object({
  personId: z.string(),
  international: HandicapValue,
  club: HandicapValue,
});

const SetHandicapRequest = z.object({
  valueHalves: z.number().int().min(-4).max(20),
  reason: z.string().trim().min(1).max(500),
});

const HandicapHistoryEntry = z.object({
  id: z.string(),
  type: z.enum(["international", "club"]),
  previousHalves: z.number().int(),
  newHalves: z.number().int(),
  reason: z.string(),
  changedAt: z.string().datetime(),
  changedBy: z.object({ personId: z.string(), fullName: z.string() }),
  season: z.object({ id: z.string(), name: z.string() }).nullable(),
});
```

El rango aparece en el contrato **y** en el dominio a propósito: el contrato rechaza barato lo
absurdo antes de tocar la base, el dominio es donde vive la regla. No son la misma capa y no se
sustituyen — lo que **no** se duplica es la decisión de si un cambio es válido, que es sólo del
dominio (`planearCambioDeHandicap`).

## 5. El camino de escritura, paso a paso

`PUT /people/:id/handicaps/:type`

1. `TenantGuard` resuelve el club por subdominio. **Un `clubId` del cliente nunca decide el
   tenant** (constitución).
2. `SessionGuard` + `handicap.edit`.
3. Cargar la persona **filtrada por `clubId`**. Si no está → 404. Nunca 403: un 403 confirmaría que
   esa persona existe en otro club (P-05, `docs/06`).
4. Leer el vigente: la fila, o `−4` si no hay (§2).
5. `planearCambioDeHandicap(actual, propuesto, motivo)`. **Aquí se decide todo**: rango,
   granularidad, motivo presente, y que de verdad cambie algo. El servicio no vuelve a comprobar
   nada por su cuenta.
6. Resolver la temporada vigente del club. Puede ser `null` y eso no bloquea (R-030-12).
7. **Una transacción**: `upsert` del vigente + `insert` del historial. En ese orden no importa;
   que estén juntas, sí.
8. `@Auditable({ action: "handicap.changed", entityType: "player_handicap" })` con
   `anotarEstadoPrevio` antes de escribir.

### Por qué se escribe el historial **y** la auditoría

Parecen lo mismo y no lo son. `audit_log` responde «quién tocó qué en el sistema» y lo lee quien
investiga un incidente; `handicap_history` responde «cómo evolucionó este jugador» y lo lee el
comisario para armar un equipo, con un formato y una privacidad propias (R-030-09). Si el historial
fuera una vista sobre `audit_log`, mostrarle su evolución a un jugador significaría darle acceso de
lectura a la auditoría del club.

## 6. Permisos: la excepción que hay que hacer explícita

`handicap.edit` se agrega a `PERMISSIONS`. **Y hay que tocar `club_admin`.**

Hoy la fila del administrador del club se calcula así:

```ts
permisos: PERMISSIONS.filter((permiso) => permiso !== "platform.club.manage"),
```

Es decir: **todo permiso nuevo le llega solo.** Verificado antes de escribir este plan —
`club_admin` tiene hoy `field.block` sin que nadie se lo haya dado explícitamente. Para `field.edit`
eso era correcto. Para `handicap.edit` es exactamente lo que R-030-02 prohíbe.

La excepción se vuelve una lista con nombre y un motivo por línea:

```ts
/**
 * Lo que un administrador de club NO puede hacer, con el motivo al lado.
 *
 * Existe porque la fila se define por resta: sin esta lista, cualquier permiso que se agregue en el
 * futuro queda concedido al administrador del club el día que se declara, sin que nadie lo decida.
 */
const FUERA_DEL_ALCANCE_DEL_CLUB_ADMIN = [
  // Dar de alta o suspender clubes es de quien opera la plataforma; un club no administra a otro.
  "platform.club.manage",
  // La autoridad deportiva es del comisario, dentro y fuera de la plataforma (`specs/030` R-030-02).
  "handicap.edit",
] as const satisfies readonly Permission[];
```

Y el comisario pasa a `permisos: ["field.block", "handicap.edit"]`.

El test de dominio que recorre roles × ámbitos × permisos **va a fallar en cuanto se agregue el
permiso**, y eso es lo que se busca: es el mismo mecanismo que detectó el cambio del comisario en
`specs/040`. Se actualiza agregando la excepción explícita `commissioner/club → handicap.edit` a la
lista `DEPORTIVOS`, nunca sacando al rol del recorrido.

## 7. La privacidad del historial (R-030-09)

Función pura, con la misma forma que `puedeVerElDetalle` de `specs/040`:

```ts
function puedeVerElHistorial(
  quienMira: { personId: string | null; esAdministrador: boolean; esComisario: boolean },
  deQuien: { personId: string; acudientes: readonly string[] },
): boolean
```

Seis casos, cada uno con su test: el comisario sí; el administrador del club sí; la propia persona
sí; el acudiente de un menor sí; otro jugador no; sin sesión no.

Los acudientes se los entrega el servicio (`GuardianshipsService`), no los consulta el dominio
(P-01).

**El rechazo es 404, no 403** — con el mismo criterio que todo el repo: un 403 sobre el historial de
alguien confirma que esa persona existe en este club.

## 8. Migraciones

Una sola, con dos tablas y un enum. Sin `GENERATED`, sin extensiones, sin `EXCLUDE`: después de
`specs/040` esto es una migración corriente.

Lo único que merece atención es **el append-only de `handicap_history`**. La constitución (regla 7)
lo exige a nivel de base de datos para `audit_log`. Aquí se declara la intención en la migración y
el `REVOKE` efectivo queda enganchado a **T-007** (el rol de base de datos de mínimo privilegio, que
está abierto y va con AWS): mientras la aplicación corra con un rol dueño de las tablas, ningún
`REVOKE` la limita. Se escribe en `verification.md` como pendiente declarado, no como hecho.

El `down.sql` borra las dos tablas y el enum, en ese orden.

## 9. Riesgos técnicos de este plan

| Riesgo | Cómo se ataca |
|---|---|
| **Un permiso nuevo se le concede solo al `club_admin`** — el problema estructural que este módulo destapa. | La lista de excepciones con nombre (§6) y el recorrido roles × permisos que falla al agregarlo. |
| **Vigente e historial divergen.** | Un solo escritor, una sola transacción, y un test que **reconstruye** el vigente desde el historial y compara. |
| **Aritmética de medios goles.** Un `/2` mal puesto convierte 2.5 en 2 sin ruido. | `HandicapHalves` es un tipo que sólo se construye por `validarHandicap`. El dominio nunca recibe un decimal. |
| **`upsert` con dos peticiones simultáneas** del comisario en dos pestañas: la segunda podría registrar un «anterior» que ya no era el actual. | El `@@unique([personId, type])` serializa el `upsert`; el «anterior» se lee **dentro** de la transacción, no antes de abrirla. Hay un test con dos transacciones concurrentes, con el mismo método que `specs/040` T-422: se comprueba que sin la lectura dentro de la transacción el test falla. |
| **El listado del club sin paginar** crece con el club. | Se pagina desde el primer día, con el criterio de `specs/010` T-078 (25 por defecto, 100 máximo, >100 es 400). |

## 10. Qué genera `tasks.md`

- **A. Dominio** — conversión y rango, la regla del cambio, la suma del equipo, la privacidad.
- **B. Permisos** — el permiso nuevo y la excepción explícita del `club_admin`.
- **C. Datos** — el esquema, la migración y el arranque desde la ausencia de fila.
- **D. API** — las cuatro rutas, con la transacción y el 404 de otro club.
- **E. Interfaz** — el handicap en el perfil, fijarlo, y el historial.
- **F. Cierre** — E2E, aislamiento y `verification.md`.
