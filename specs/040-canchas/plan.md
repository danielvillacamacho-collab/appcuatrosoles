# PLAN-040 — Canchas y calendario

> Cómo se construye `spec.md`. Entidades, endpoints, contratos y los puntos donde esto se puede
> hacer mal sin que se note.

## 0. La decisión de diseño de este módulo

**`starts_at` y `ends_at` como columnas normales, más una columna generada `time_range` que sostiene
la restricción.**

El problema: la garantía de no solapamiento se expresa en PostgreSQL sobre un rango
(`EXCLUDE USING gist (field_id WITH =, time_range WITH &&)`), y **Prisma no sabe leer ni escribir un
`tstzrange`**. Las salidas eran dos:

1. Declarar la columna como `Unsupported("tstzrange")` y hacer **todas** las lecturas y escrituras
   con SQL crudo. La restricción funciona, pero cada consulta del calendario —la operación más
   frecuente del módulo— se escribe a mano, sin tipos y sin el filtro de tenant que aplica el
   repositorio. Es exactamente donde P-05 se rompe sin que nadie lo note.
2. Guardar los dos instantes como columnas normales y **derivar el rango en la base**:

```sql
ALTER TABLE "field_booking"
  ADD COLUMN "time_range" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;
```

Se elige la segunda. La aplicación trabaja con `startsAt`/`endsAt` como con cualquier otra fecha
—consultas tipadas, filtro de club en el repositorio, nada de SQL suelto— y **la base deriva el
rango y lo defiende**. Nadie puede insertar un rango incoherente con sus propios extremos, porque no
existe forma de escribirlo: es generado.

El `'[)'` de la expresión es la convención semiabierta de `R-040-04`, y ponerla **ahí** significa que
ningún módulo futuro puede elegir otra por descuido.

`prisma migrate dev --create-only` y después se edita el SQL a mano, que es el mismo camino que
siguieron los triggers de `audit_log` en T-004.

## 1. Esquema de datos (Prisma)

```prisma
enum FieldStatus {
  active
  maintenance
  archived
}

/// Una cancha. `docs/02` §D.
model Field {
  id     String @id @default(uuid(7))
  clubId String @map("club_id")

  name          String
  surface       String?
  capacityNotes String?      @map("capacity_notes")
  status        FieldStatus  @default(active)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  club     Club           @relation(fields: [clubId], references: [id], onDelete: Restrict)
  bookings FieldBooking[]

  /// Dos canchas del mismo club no se llaman igual: «¿reservaste la Cancha 2?» tiene que tener
  /// una sola respuesta.
  @@unique([clubId, name])
  @@index([clubId, status])
  @@map("field")
}

enum BookingType {
  practice
  lesson
  tournament_match
  stick_and_ball
  coaching
  maintenance
  block
}

enum BookingVisibility {
  public
  private
}

/// La tabla central antidoble-reserva. TODA ocupación de una cancha pasa por aquí (R-040-01).
model FieldBooking {
  id      String @id @default(uuid(7))
  clubId  String @map("club_id")
  fieldId String @map("field_id")

  startsAt DateTime @map("starts_at") @db.Timestamptz(3)
  endsAt   DateTime @map("ends_at")   @db.Timestamptz(3)

  /// Columna GENERADA en la migración: tstzrange(starts_at, ends_at, '[)').
  /// Prisma no la sabe leer y no hace falta que la lea — existe para que la restricción de
  /// exclusión tenga sobre qué operar. `Unsupported` la declara para que `migrate` no intente
  /// borrarla en la siguiente migración.
  timeRange Unsupported("tstzrange")? @map("time_range")

  type       BookingType
  visibility BookingVisibility @default(public)

  /// El evento que originó la reserva: la práctica, la clase, la copa. Nulo en un bloqueo
  /// administrativo, que no tiene otro evento detrás — es el evento.
  sourceId String? @map("source_id")

  /// Por qué se bloqueó. Sólo tiene sentido en `maintenance` y `block`.
  reason String?

  createdById String   @map("created_by_id")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  cancelledAt DateTime? @map("cancelled_at") @db.Timestamptz(3)

  club      Club        @relation(fields: [clubId], references: [id], onDelete: Restrict)
  field     Field       @relation(fields: [fieldId], references: [id], onDelete: Restrict)
  createdBy UserAccount @relation(fields: [createdById], references: [id])

  /// El calendario de un día es siempre «este club, este rango»: sin este índice es un recorrido
  /// completo de la tabla que crece con cada práctica del año.
  @@index([clubId, startsAt])
  @@index([fieldId, startsAt])
  @@map("field_booking")
}
```

### SQL a mano en la migración

```sql
-- La columna generada y la restricción que hace imposible el solapamiento (R-040-02).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "field_booking"
  ADD COLUMN "time_range" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

ALTER TABLE "field_booking"
  ADD CONSTRAINT "no_field_overlap"
  EXCLUDE USING gist ("field_id" WITH =, "time_range" WITH &&)
  WHERE ("cancelled_at" IS NULL);

-- Una reserva que termina antes de empezar no es un caso de negocio: es un dato roto.
ALTER TABLE "field_booking"
  ADD CONSTRAINT "field_booking_ends_after_starts" CHECK ("ends_at" > "starts_at");
```

### Comprobado contra PostgreSQL 16, no supuesto

Todo lo de arriba se probó contra la base real antes de escribir una línea de aplicación, porque el
módulo entero se apoya en que se comporte así:

| Caso | Resultado |
|---|---|
| 5:30–7:00 después de 4:00–5:30 | **entra** — la convención semiabierta funciona |
| Solape de **un minuto** | `conflicting key value violates exclusion constraint` |
| Otra cancha a la misma hora | entra |
| Escribir `time_range` a mano | `cannot insert a non-DEFAULT value into column "time_range"` |
| Reserva **cancelada** en una franja ocupada | entra — lo cancelado no ocupa (R-040-03) |

El cuarto es el que hace que la columna generada valga la pena: **no existe forma de escribir un
rango que no se derive de sus propios extremos**, ni desde la aplicación ni desde `psql`.

> **`btree_gist` no es opcional.** `field_id` es un `uuid` y GiST no sabe compararlo por igualdad sin
> esa extensión; sin ella la restricción no se puede crear y el error (`data type uuid has no
> default operator class`) no menciona la extensión por ningún lado.

## 2. Estructura de archivos

```
packages/domain/src/scheduling/
├── overlap.ts            # seSolapan — la convención semiabierta, en un solo lugar
├── operatingHours.ts     # cabeEnElHorario
├── calendarPrivacy.ts    # puedeVerElDetalle — R-040-07 como función pura
└── __tests__/

apps/api/src/fields/
├── fields.module.ts
├── fields.controller.ts       # /fields
├── fields.service.ts
├── calendar.controller.ts     # /calendar
├── calendar.service.ts        # arma el día y APLICA la privacidad
├── bookings.service.ts        # crear/cancelar reservas; lo usarán 050, 060, 070
└── overlap-error.ts           # traduce 23P01 a un error de contrato legible

packages/contracts/src/
├── field.ts
└── calendar.ts
```

**`bookings.service.ts` es la pieza que los módulos siguientes van a consumir.** Se diseña desde
ahora como puerto para prácticas y clases: `reservar({ fieldId, startsAt, endsAt, type, sourceId,
visibility }, tx)` **recibiendo la transacción**, para que crear una práctica y ocupar su cancha sean
la misma operación atómica. Si fueran dos, existiría el estado «práctica sin cancha».

## 3. Contratos clave (Zod)

```ts
export const FieldResponse = z.object({
  id: z.string(),
  name: z.string(),
  surface: z.string().nullable(),
  capacityNotes: z.string().nullable(),
  status: z.enum(["active", "maintenance", "archived"]),
});

export const CreateFieldRequest = z.object({
  name: z.string().trim().min(1).max(60),
  surface: z.string().max(120).optional(),
  capacityNotes: z.string().max(300).optional(),
});

/** Una franja del calendario. **Dos formas, y la diferencia es la privacidad** (R-040-07). */
export const CalendarEntry = z.discriminatedUnion("detalle", [
  z.object({
    detalle: z.literal(true),
    id: z.string(),
    fieldId: z.string(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    type: z.string(),
    reason: z.string().nullable(),
    sourceId: z.string().nullable(),
  }),
  z.object({
    // Lo ajeno y privado: cancha, horario, y nada más. Ni id, ni tipo, ni de quién es.
    detalle: z.literal(false),
    fieldId: z.string(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  }),
]);

export const BlockFieldRequest = z.object({
  fieldId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().trim().min(1).max(200),
});
```

> **La unión discriminada es deliberada.** Con un solo objeto de campos opcionales, «Ocupado» sería
> el mismo tipo con los campos en `null` — y el día que alguien agregue un campo a la respuesta, se
> lo va a agregar a los dos casos sin pensarlo. Con dos formas distintas, agregar un dato al caso
> detallado **no lo agrega** al anónimo, y el compilador lo dice.

## 4. Permisos nuevos

| Permiso | Quién lo tiene | Para qué |
|---|---|---|
| `field.edit` | `club_admin` | crear, editar y archivar canchas |
| `field.block` | `club_admin`, `commissioner` | bloquear una franja |

`GET /calendar` **no exige permiso**, sólo sesión: cualquiera del club ve la ocupación. Lo que acota
lo que ve no es un rol, es R-040-07.

## 5. La consulta del calendario, paso a paso

Es la operación más frecuente del módulo y la que más fácil se hace mal:

1. Se recibe `date=YYYY-MM-DD` — **una fecha de calendario, no un instante**.
2. Se traduce a un rango UTC **usando la zona del club** (`toLocalDate` a la inversa). Un martes en
   Bogotá empieza a las 05:00 UTC; resolverlo con la zona del servidor daría otro día.
3. Se consultan las reservas del club que se solapan con ese rango, sin cancelar.
4. **Recién ahí** se aplica `puedeVerElDetalle` a cada una, con quién está preguntando.
5. Se serializa cada entrada en una de las dos formas del contrato.

El paso 4 va en el servicio y no en el controlador ni en el cliente: es la regla, y tiene que estar
donde no se pueda saltar.

## 6. Migraciones — orden y puntos de atención

1. `CREATE EXTENSION IF NOT EXISTS btree_gist` — antes que nada.
2. `field` con su unicidad por club.
3. `field_booking`, la columna generada, la restricción de exclusión y el `CHECK`.
4. Las tres canchas del club de ejemplo en `db:seed`, y en `crearClubCompleto` (specs/020) para que
   un club nuevo nazca con ellas.

El `down.sql` correspondiente. **La extensión no se borra en el `down`**: puede estar en uso por otra
cosa, y quitarla es más peligroso que dejarla.

## 7. Riesgos técnicos específicos de este plan

| Riesgo | Mitigación |
|---|---|
| El error `23P01` llega al usuario como un error interno | `overlap-error.ts` lo traduce a un código de contrato; test que lo provoca de verdad |
| La columna generada se pierde en una migración futura porque Prisma no la entiende | declarada como `Unsupported` en el esquema; test de integración que inserta dos reservas solapadas y espera el fallo |
| Alguien crea una reserva sin pasar por `bookings.service` | es el único que escribe `field_booking`; regla de arquitectura en `dependency-cruiser` cuando 050 lo consuma |
| La privacidad se prueba sólo con el caso feliz | el test recorre los seis casos (participante, creador, público, ajeno privado, ajeno público, sin sesión) y **serializa la respuesta** buscando identificadores |
| Dos escrituras concurrentes se prueban en secuencia y el test pasa sin probar nada | el test abre dos transacciones de verdad y las confirma a la vez |

## 8. Qué genera `tasks.md`

En este orden: extensión y esquema → dominio puro (`seSolapan`, horario, privacidad) → repositorio y
servicio de reservas → canchas (CRUD) → bloqueos → calendario con privacidad → pantallas → E2E.

El dominio puro va **antes** que el API a propósito: `seSolapan` y `puedeVerElDetalle` son las dos
reglas que todo lo demás consulta, y escribirlas primero obliga a decidir los bordes —el minuto
exacto, el caso sin sesión— antes de que haya una pantalla presionando por salir.
