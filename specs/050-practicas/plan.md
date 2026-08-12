# PLAN-050 — Prácticas oficiales

> Cómo se construye `spec.md`. Entidades, contratos, archivos y los puntos donde este módulo se
> puede equivocar en silencio.

## 0. Las dos decisiones de diseño de este módulo

En `specs/040` la decisión fue dejar que PostgreSQL garantice lo imposible. En `specs/030`, que el
historial fuera la tabla y el vigente una caché. Aquí hay dos, y las dos son «no guardar lo que se
puede calcular» y «no programar lo que se puede consultar».

### 0.1. La lista de espera no se materializa

Quién está dentro y quién en espera es **una función del orden de postulación**, no una columna.

Escribirlo como columna obliga a mantenerlo: alguien se retira y hay que promover al siguiente, con
un proceso que puede fallar, correr dos veces, o quedarse a medias — y una fila con `status =
accepted` que ya no debería estarlo es indistinguible de una correcta.

Calculándolo al leer, **un retiro promueve al siguiente sin que corra nada**. No hay proceso de
promoción, no hay carrera por el último cupo, y no hay estado que pueda quedar mal.

El precio es ordenar y agrupar en cada lectura. Con cuarenta postulaciones por práctica, es gratis.

**Se materializa una sola vez: al decidir.** Ahí el reparto deja de ser una vista y pasa a ser un
hecho —«ésta es la gente que jugó»—, y tiene que quedar estable aunque después cambie cualquier
cosa. Es el mismo criterio del congelado de handicaps al arrancar una copa (`docs/02` §E).

### 0.2. La decisión no se programa: se consulta

Podría encolarse un trabajo para las 6:00 p.m. de cada práctica. **No se hace**, por una razón:
un trabajo programado que no se disparó —porque el servidor estaba caído, porque se perdió en un
despliegue, porque alguien cambió la hora— **no deja rastro**. La práctica se queda esperando para
siempre y nadie se entera hasta que alguien pregunta.

En cambio, «dame las prácticas publicadas cuya hora de decisión ya pasó» es una consulta que
**siempre da la respuesta correcta**, se corra cuando se corra. Si el sistema estuvo caído dos
horas, al volver decide lo que quedó pendiente. Es la misma forma del `OutboxProcessor` que ya
existe (`specs/010`), y por las mismas razones.

## 1. Esquema de datos (Prisma)

```prisma
enum PracticeStatus {
  /// Sólo la ve quien la creó. No ocupa cancha (R-050-03).
  draft
  /// Visible, recibiendo postulados, con la cancha reservada.
  published
  confirmed
  cancelled
  /// `played` y `settled` llegan con `051` y Fase 3. No se declaran todavía.
}

model Practice {
  id       String @id @default(uuid(7))
  clubId   String @map("club_id")
  seasonId String? @map("season_id")
  fieldId  String @map("field_id")

  startsAt DateTime @map("starts_at") @db.Timestamptz(3)
  endsAt   DateTime @map("ends_at")   @db.Timestamptz(3)

  chukkers     Int
  handicapType HandicapType @map("handicap_type")

  /// El rango **orienta**, no filtra (R-050-04). Se muestra; no rechaza a nadie.
  suggestedMinHalves Int? @map("suggested_handicap_min_halves")
  suggestedMaxHalves Int? @map("suggested_handicap_max_halves")

  /// **El nivel máximo sí filtra, pero sólo a estudiantes** (R-050-05). Va aparte del rango
  /// sugerido a propósito: son dos cosas distintas que se verían igual en una sola columna.
  maxLevelHalves Int? @map("max_level_halves")

  /// Cupos en **puestos**, no en personas: una pareja de medios hombres ocupa uno (R-050-07).
  targetPlayers Int @map("target_players")
  minPlayers    Int @map("min_players")

  applicationsCloseAt DateTime @map("applications_close_at") @db.Timestamptz(3)
  decisionAt          DateTime @map("decision_at")           @db.Timestamptz(3)

  status             PracticeStatus @default(draft)
  cancellationReason String?        @map("cancellation_reason")

  /// La reserva de cancha que creó al publicarse. Nula en borrador (R-050-03).
  fieldBookingId String? @unique @map("field_booking_id")

  /// **Declarado y sin usar** hasta Fase 3, con el criterio de `handicap_history.on_behalf_of_id`.
  pricePolicyId String? @map("price_policy_id")

  decidedAt   DateTime? @map("decided_at") @db.Timestamptz(3)
  createdById String    @map("created_by_id")

  applications PracticeApplication[]

  @@index([clubId, startsAt])
  @@index([status, decisionAt])   // la consulta de §0.2
  @@map("practice")
}

model PracticeApplication {
  id         String @id @default(uuid(7))
  clubId     String @map("club_id")
  practiceId String @map("practice_id")
  personId   String @map("person_id")

  chukkersOffered Int @map("chukkers_offered")

  /// Medio hombre. La pareja **sólo existe si es recíproca** (R-050-08); la reciprocidad se
  /// comprueba en el dominio, no con una restricción — una restricción que exija que el otro lo
  /// haya escrito primero haría imposible escribir el primero.
  halfManPartnerPersonId String? @map("half_man_partner_person_id")

  appliedAt   DateTime  @default(now()) @map("applied_at") @db.Timestamptz(3)
  withdrawnAt DateTime? @map("withdrawn_at") @db.Timestamptz(3)

  /// **Nulo hasta que la práctica se decide** (§0.1). Antes de eso, quién está dentro se calcula.
  outcome PracticeOutcome? @map("outcome")

  practice Practice @relation(fields: [practiceId], references: [id])

  /// Una postulación vigente por persona y práctica. **Parcial**: quien se retiró puede volver a
  /// postularse, y entra al final de la fila (HU-050-03).
  @@index([practiceId, appliedAt])
  @@map("practice_application")
}

/// El nivel hasta el que un estudiante está habilitado (`docs/02` §B). **Es un filtro duro.**
model PracticeEligibility {
  id       String @id @default(uuid(7))
  clubId   String @map("club_id")
  personId String @map("person_id")

  maxHandicapHalves Int      @map("max_handicap_halves")
  grantedById       String   @map("granted_by_id")
  grantedAt         DateTime @default(now()) @map("granted_at") @db.Timestamptz(3)
  revokedById       String?  @map("revoked_by_id")
  revokedAt         DateTime? @map("revoked_at") @db.Timestamptz(3)

  /// Se revoca, no se borra (P-06): «quién lo habilitó y cuándo» es justamente lo que hay que
  /// poder responder si un estudiante se lastima en una práctica que no le correspondía.
  @@index([personId, revokedAt])
  @@map("practice_eligibility")
}
```

### El índice único parcial, a mano

Prisma no expresa índices únicos parciales. Va en la migración:

```sql
CREATE UNIQUE INDEX "una_postulacion_vigente"
  ON "practice_application" ("practice_id", "person_id")
  WHERE "withdrawn_at" IS NULL;
```

**Y hay que revisar la migración por lo de siempre**: Prisma vuelve a meter
`ALTER TABLE "field_booking" ALTER COLUMN "time_range" DROP DEFAULT`, que PostgreSQL rechaza con
42601 y hace fallar la migración entera. Ver la cabecera de `20260811234305_handicaps`.

## 2. Estructura de archivos

```
packages/domain/src/practice/
  slots.ts          armarPuestos, repartirCupos
  eligibility.ts    puedePostularse
  decision.ts       decidirPractica, estaAbiertaLaPostulacion
  __tests__/

apps/api/src/practices/
  practices.service.ts       crear, publicar, cancelar. Escribe la reserva por BookingsService
  applications.service.ts    postularse, retirarse, aceptar pareja
  decision.processor.ts      la consulta de §0.2, con la misma forma que OutboxProcessor
  practices.controller.ts
  practices.module.ts

apps/web/src/features/practices/
```

## 3. Contratos clave (Zod)

```ts
const CreatePracticeRequest = z.object({
  fieldId: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  chukkers: z.number().int().min(4).max(12),
  handicapType: HandicapTypeSchema,
  suggestedMinHalves: z.number().int().min(-4).max(20).optional(),
  suggestedMaxHalves: z.number().int().min(-4).max(20).optional(),
  maxLevelHalves: z.number().int().min(-4).max(20).optional(),
  targetPlayers: z.number().int().min(2).max(20),
  minPlayers: z.number().int().min(2).max(20),
  applicationsCloseAt: z.string().datetime(),
  decisionAt: z.string().datetime(),
});

/** Lo que ve quien mira una práctica. */
const PracticeResponse = z.object({
  // …
  /** **Dónde estoy yo**: es la mitad de la razón por la que alguien abre esta pantalla. */
  miPostulacion: z
    .object({
      estado: z.enum(["dentro", "en_espera"]),
      posicion: z.number().int(),
      chukkersOffered: z.number().int(),
      medioHombre: z
        .object({ personId: z.string(), fullName: z.string(), aceptada: z.boolean() })
        .nullable(),
    })
    .nullable(),
  puestosDentro: z.number().int(),
  puestosEnEspera: z.number().int(),
});
```

`chukkers` no se limita a `[6, 7, 8]` en el contrato: eso es configuración del club
(`practice.default_chukkers_options`), y un contrato que la fije obliga a desplegar para que un club
juegue a 5. El contrato acota lo absurdo; la política la pone `settings` (P-04).

## 4. Permisos

`practice.manage`, nuevo. **Lo tienen el administrador del club y el comisario.**

A diferencia de `handicap.edit`, éste **no** va en `AUTORIDAD_DEPORTIVA`: el documento fuente dice
«el administrador del club (o el comisario) crea la práctica», así que aquí mandan los dos. Como la
fila del `club_admin` se define por resta, le llega solo — y eso es lo correcto esta vez.

**Pero el test de conjunto exacto de `specs/030` va a fallar igual**, y está bien: obliga a escribir
la decisión en vez de heredarla. Se actualiza agregando `practice.manage` a las listas esperadas del
`superadmin` y del `club_admin`, y `commissioner/club → practice.manage` a `DEPORTIVOS`.

## 5. El camino de publicación, paso a paso

`POST /practices/:id/publish`

1. Tenant por subdominio; `practice.manage`; la práctica cargada **filtrada por club** (404 si no).
2. Estado tiene que ser `draft`. Publicar dos veces no reserva dos veces.
3. **Una transacción**:
   a. `BookingsService.reservar(tx, …)` con `type: "practice"` y `visibility: "public"`. Si choca,
      la excepción sale de aquí y la práctica sigue en borrador.
   b. `practice.update({ status: "published", fieldBookingId })`.
4. Fuera de la transacción no queda nada por hacer: publicar no avisa a nadie todavía.

`POST /practices/:id/cancel` hace lo simétrico: marca `cancelled`, **cancela la reserva** y encola
los avisos, todo en la misma transacción (R-050-12, P-11).

## 6. El proceso de decisión

```ts
// Misma forma que OutboxProcessor: una consulta de lo vencido, no un horario.
const vencidas = await tx.practice.findMany({
  where: { status: "published", decisionAt: { lte: this.clock.now() } },
  take: limite,
});
```

Por cada una, **en su propia transacción**:

1. Se recargan las postulaciones vigentes **con `FOR UPDATE` sobre la práctica**. La lección de
   `specs/030`: `READ COMMITTED` no serializa nada, y aquí compiten el proceso de decisión y alguien
   retirándose en el mismo segundo.
2. `armarPuestos` + `repartirCupos` + `decidirPractica`.
3. Se **materializa** el reparto en `outcome` (§0.1) y se escribe el estado.
4. Se encolan los avisos **en la misma transacción** (P-11).

La idempotencia sale sola: la consulta pide `status = published`, y el paso 3 lo cambia. Una segunda
corrida no la encuentra. **No hace falta una marca de «ya avisado»**, y no tenerla es mejor que
tenerla — una marca puede quedar desincronizada del estado.

## 7. Avisos nuevos

`practice.confirmed` y `practice.cancelled` entran a `NOTIFICATION_TYPES`. **No** entran a
`SIEMPRE_SE_ENVIAN`: son avisos de actividad, no de seguridad, y alguien tiene derecho a silenciar
los correos del club sin perder «tu contraseña cambió».

> Ojo con la trampa de `specs/010`: el `OutboxProcessor` tuvo un atajo que hacía que **todo** aviso
> se considerara inevitable, y las preferencias no se podían apagar. Lo destapó un test de
> integración. Estos dos tipos necesitan un test que compruebe que **sí** se pueden silenciar.

## 8. Riesgos técnicos de este plan

| Riesgo | Cómo se ataca |
|---|---|
| **El corte de cupos calculado al leer sale distinto en dos lecturas** —por un orden inestable— y alguien ve «estás dentro» y luego «estás en espera». | El orden es `applied_at`, y se desempata por `id` (uuid v7, monótono). Hay un test con dos postulaciones en el mismo milisegundo. |
| **El proceso de decisión y un retiro simultáneo.** | `FOR UPDATE` sobre la práctica, con la lección de `specs/030` T-332 ya aprendida. Y el test se escribe **forzando el solape a mano**, no con `Promise.all`. |
| **Se avisa dos veces.** | La consulta filtra por `status`, que la propia transacción cambia. Test: correr el proceso dos veces seguidas y contar los mensajes encolados. |
| **La reserva queda huérfana**: práctica cancelada con cancha ocupada, o publicación fallida con reserva creada. | Todo en una transacción, y un test que programa algo encima inmediatamente después de cancelar. |
| **El filtro del estudiante se aplica sólo al listar**, y el detalle se cuela por el enlace. | El filtro va en el servicio y se prueba pidiendo la práctica por su identificador. |
| **`min_players` mayor que `target_players`** deja una práctica que nunca se puede confirmar. | Se valida al crear, en el dominio. |

## 9. Qué genera `tasks.md`

- **A. Dominio** — puestos y reparto, elegibilidad, decisión, ventana de postulación.
- **B. Permisos** — `practice.manage` y la actualización del test de conjunto exacto.
- **C. Datos** — esquema, migración, el índice único parcial y `practice_eligibility`.
- **D. API** — crear/publicar/cancelar con la reserva, postularse, retirarse, medio hombre.
- **E. Decisión** — el proceso, la idempotencia, el sistema caído, la concurrencia.
- **F. Interfaz** — tablero, detalle con «dónde estoy yo», crear práctica.
- **G. Cierre** — E2E, aislamiento y `verification.md`.
