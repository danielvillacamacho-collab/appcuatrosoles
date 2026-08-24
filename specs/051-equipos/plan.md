# PLAN-051 — Equipos y balanceo

> Cómo se construye `spec.md`. Entidades, contratos, archivos y los puntos donde este módulo se
> puede equivocar en silencio.

## 0. La decisión de diseño de este módulo

En `050` fue «no guardar lo que se puede calcular». Aquí es lo contrario, y por eso vale la pena
decirlo: **los equipos sí se guardan, y con ellos el handicap con que se armaron.**

La razón es la misma que sostenía aquella decisión, aplicada al revés. Allá el reparto de cupos era
una **vista sobre hechos que no cambian** —quién se postuló y cuándo—, así que calcularlo siempre
daba lo mismo. Acá el reparto depende de un dato **que sí cambia**: el handicap de cada jugador. Un
equipo recalculado tres semanas después con handicaps nuevos no es «el mismo equipo bien
calculado»: es otro equipo, y contradice lo que `specs/030` R-030-06 promete al no tener fechas de
vigencia.

Por eso `practice_slot` guarda `effective_handicap_halves`: **el handicap con que se decidió**, no
una referencia al vigente. Es el mismo criterio del congelado de las copas (`docs/02` §E).

### El reparto es exacto, no aproximado

«Lo más parejo posible» es una promesa que conviene cumplir literalmente, porque es exactamente lo
que alguien va a auditar cuando no le guste su equipo.

Repartir en dos grupos minimizando la diferencia de sumas es el problema de la partición, que en
general es duro — y por eso la tentación es hacer un reparto codicioso «el más fuerte al equipo más
liviano», que es fácil de escribir y **no siempre da el más parejo**.

No hace falta conformarse: con programación dinámica sobre `(cuántos van en A, suma de A)` el
reparto exacto cuesta `O(n² · S)`, donde `S` es la suma total de handicaps. Con el máximo que
permite el contrato —40 jugadores de 10 goles— son 1.3 millones de estados, que en la práctica es
instantáneo. **No hay camino aproximado**, y por lo tanto no hay dos comportamientos que explicar.

## 1. Esquema de datos (Prisma)

```prisma
enum TeamLabel {
  A
  B

  @@map("team_label")
}

/// Un equipo de una práctica. **Borrador mientras `approvedAt` sea nulo** (R-051-05).
model PracticeTeam {
  id         String @id @default(uuid(7))
  clubId     String @map("club_id")
  practiceId String @map("practice_id")

  label TeamLabel

  /// La suma de los puestos, guardada. Se puede recalcular desde `practice_slot`, y se guarda
  /// igual: es lo que se muestra en un listado sin traer todos los puestos de todas las prácticas.
  handicapTotalHalves Int @map("handicap_total_halves")

  approvedById String?   @map("approved_by_id")
  approvedAt   DateTime? @map("approved_at") @db.Timestamptz(3)

  slots PracticeSlot[]

  /// Un equipo A y un equipo B por práctica, no más.
  @@unique([practiceId, label])
  @@map("practice_team")
}

/// Un puesto dentro de un equipo. Uno o dos jugadores (medio hombre).
model PracticeSlot {
  id             String @id @default(uuid(7))
  clubId         String @map("club_id")
  practiceTeamId String @map("practice_team_id")

  position Int

  primaryPersonId   String  @map("primary_person_id")
  /// El medio hombre. La pareja viene de `practice_application` (`specs/050` R-050-08).
  secondaryPersonId String? @map("secondary_person_id")

  /// **El handicap con que se armó el equipo, congelado** (§0). Para un puesto compartido, el más
  /// alto de los dos (R-051-06).
  effectiveHandicapHalves Int @map("effective_handicap_halves")

  /// Declarado y sin usar hasta Fase 3, con el criterio de `practice.price_policy_id`.
  costSharePrimaryPct Int @default(50) @map("cost_share_primary_pct")

  team PracticeTeam @relation(fields: [practiceTeamId], references: [id], onDelete: Cascade)

  @@unique([practiceTeamId, position])
  @@map("practice_slot")
}
```

`onDelete: Cascade` de puesto a equipo, y **sólo ahí**: rearmar los equipos borra los dos equipos y
los vuelve a crear, y que los puestos se vayan con ellos es lo que hace que no queden huérfanos.
Hacia la práctica el borrado sigue siendo `Restrict`, como todo en el repo.

## 2. Estructura de archivos

```
packages/domain/src/practice/
  balance.ts        handicapDelPuesto, balancearEquipos
  __tests__/

apps/api/src/practices/
  teams.service.ts      proponer, ajustar, aprobar
  teams.controller.ts
  decision.processor.ts ← propone al confirmar, en la misma transacción

apps/web/src/features/practices/
```

## 3. Contratos clave (Zod)

```ts
const PracticeSlotResponse = z.object({
  position: z.number().int(),
  effectiveHandicapHalves: z.number().int(),
  titular: z.object({ personId: z.string(), fullName: z.string() }),
  /** El medio hombre. **Se muestran los dos nombres** (HU-051-03). */
  companero: z.object({ personId: z.string(), fullName: z.string() }).nullable(),
});

const PracticeTeamsResponse = z.object({
  aprobados: z.boolean(),
  diferenciaHalves: z.number().int(),
  equipos: z.array(
    z.object({
      label: z.enum(["A", "B"]),
      handicapTotalHalves: z.number().int(),
      slots: z.array(PracticeSlotResponse),
    }),
  ),
});

/** Ajustar es mandar la composición entera, no un diff. */
const AdjustTeamsRequest = z.object({
  equipos: z.array(z.object({ label: z.enum(["A", "B"]), positions: z.array(z.string()) })),
});
```

**Ajustar manda la composición completa y no «movimientos»**, y es deliberado: dos pestañas abiertas
mandando movimientos incrementales sobre estados distintos producen un equipo que ninguna de las dos
vio. Con la composición entera, la última gana y lo que quedó es exactamente lo que alguien miró.

## 4. Permisos

**Ninguno nuevo.** `practice.manage` ya cubre proponer, ajustar y aprobar: los equipos son parte de
la práctica y los maneja quien la maneja.

Que el test de conjunto exacto de permisos **no** se toque en este módulo es la señal de que el
permiso estaba bien pensado.

## 5. La propuesta al confirmar

El `DecisionProcessor` de `050`, cuando decide `confirmar`, propone los equipos **en la misma
transacción**. Si se hiciera después, una práctica confirmada podría quedar sin equipos —proceso
muerto entre las dos escrituras— y la promesa de HU-051-01 dependería de que nadie se caiga.

Cancelar **no** propone nada (R-051-01).

## 6. Riesgos técnicos de este plan

| Riesgo | Cómo se ataca |
|---|---|
| **El reparto no es determinista** y dos consultas dan equipos distintos. | Se ordena la entrada por `(handicap desc, id asc)` antes de repartir, y el desempate al reconstruir es fijo. Test: el mismo conjunto **desordenado** da el mismo resultado. |
| **El codicioso se cuela** porque es más fácil. | Hay un caso de prueba donde el codicioso falla y el exacto acierta —`[8,7,6,5,4]`—, y el test comprueba el reparto exacto, no «uno razonable». |
| **El medio hombre se cuenta dos veces.** | La unidad de reparto es el **puesto**, y un puesto tiene un peso. La suma nunca recorre personas. |
| **Un borrador se filtra a un jugador.** | El servicio devuelve 404 si no está aprobado y quien pregunta no puede aprobar; el test **serializa la respuesta completa** buscando nombres, como `specs/040` T-451. |
| **Rearmar deja puestos huérfanos.** | `onDelete: Cascade` de puesto a equipo, y un test que rearma dos veces y cuenta filas. |

## 7. Qué genera `tasks.md`

- **A. Dominio** — el peso del puesto y el reparto exacto.
- **B. Datos** — esquema y migración.
- **C. API** — proponer, ajustar, aprobar, y la propuesta automática al confirmar.
- **D. Interfaz** — la pantalla del comisario con la diferencia en vivo, y los equipos en el detalle.
- **E. Cierre** — E2E, aislamiento y `verification.md`.
