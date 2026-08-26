# PLAN-052 — Grilla de chukkers, asistencia y resultado

> Cómo se construye `spec.md`. Entidades, contratos, archivos y los puntos donde este módulo se
> puede equivocar en silencio.

## 0. La decisión de diseño de este módulo

**La grilla se materializa: 48 filas al aprobar los equipos, aunque no haya pasado nada.**

La tentación es la contraria, y es fuerte. «Todos juegan todo» es la regla; lo interesante son las
excepciones; guardemos sólo las excepciones y calculemos el resto. Serían cero filas para una
práctica normal en vez de 48, y suena a la misma decisión que `050` tomó bien al no guardar el
reparto de cupos.

No es la misma decisión, y la diferencia es la que decide este plan. Allá lo calculado era una
**vista sobre hechos que no cambian**. Acá lo que se guardaría es un *diff* contra una grilla
esperada, y entonces la invariante que sostiene el módulo —**nadie juega dos veces el mismo
chukker** (R-052-04)— habría que comprobarla contra la **superposición** del diff sobre lo esperado,
no contra lo guardado. Una invariante que sólo se cumple después de una capa de cálculo es una
invariante que un día no se cumple, y nadie se entera hasta que las cuentas no cuadran.

Materializada, esa invariante es un `UNIQUE` de PostgreSQL. Deja de depender de que el código la
recuerde.

48 filas por práctica es nada —una temporada entera de un club son decenas de miles—, y a cambio se
gana que **contar los chukkers de alguien sea contar filas**, sin superponer nada.

### La celda vacía existe

Sacar a alguien de un chukker **no borra la fila**: le pone `person_id` a nulo. El hueco —equipo A,
puesto 2, chukker 4— sigue existiendo, porque volver a llenarlo tiene que ser tan fácil como
vaciarlo, y porque una grilla con huecos es información: se ve dónde faltó gente.

Esto encaja con el `UNIQUE` mejor de lo que parece: PostgreSQL trata los nulos como distintos entre
sí en un índice único, así que `UNIQUE(practice_id, chukker_no, person_id)` **permite muchas celdas
vacías en el mismo chukker y prohíbe dos veces a la misma persona**, que es exactamente lo que dice
la regla. No hay que escribir nada para conseguirlo, pero sí hay que saberlo, porque es la clase de
cosa que uno «arregla» sin querer poniendo un `NOT NULL`.

## 1. Esquema de datos (Prisma)

```prisma
/// Una celda de la grilla: un puesto en un chukker (`specs/052`).
///
/// Nace al aprobarse los equipos, en la misma transacción (R-052-01). `personId` nulo es un hueco
/// —nadie jugó ese puesto ese chukker—, no una celda que falte.
model ChukkerGridCell {
  id         String @id @default(uuid(7))
  clubId     String @map("club_id")
  practiceId String @map("practice_id")

  chukkerNo Int @map("chukker_no")

  /// **El equipo es una coordenada, no una llave foránea.** Ver §5: volver a proponer equipos los
  /// borra y los recrea, así que una celda que colgara de `practice_team` se iría con ellos.
  team     TeamLabel
  position Int

  /// Nulo = hueco. Puede ser cualquier persona activa del club, no sólo un aceptado (R-052-05).
  personId String? @map("person_id")

  /// Declarada y sin usar hasta `080`. La grilla es donde va a vivir el caballo de cada chukker.
  horseId String? @map("horse_id")

  /// Un solo hueco por (chukker, equipo, puesto): la grilla no puede tener dos celdas para el mismo
  /// lugar.
  @@unique([practiceId, chukkerNo, team, position])

  /// **R-052-04, en la base y no en el código.** Los nulos no chocan entre sí, así que esto permite
  /// huecos y prohíbe que alguien juegue dos veces el mismo chukker.
  @@unique([practiceId, chukkerNo, personId])

  /// Contar los chukkers de una persona en una temporada sin recorrer prácticas.
  @@index([clubId, personId])
  @@map("chukker_grid_cell")
}

/// Cómo terminó una práctica. Opcional (R-052-09): una práctica se cierra sin marcador.
model PracticeResult {
  /// Uno por práctica: la clave primaria **es** la práctica.
  practiceId String @id @map("practice_id")
  clubId     String @map("club_id")

  teamAGoals Int     @map("team_a_goals")
  teamBGoals Int     @map("team_b_goals")
  notes      String?

  recordedById String   @map("recorded_by_id")
  recordedAt   DateTime @map("recorded_at") @db.Timestamptz(3)

  @@map("practice_result")
}
```

`Practice` gana `closedAt`, `closedById`, y el estado **`played`** en `PracticeStatus`. El comentario
del enum decía que `played` llegaba con `051`; llega ahora, que es cuando algo lo produce. Hay que
actualizar ese comentario en la misma migración: un comentario que promete mal es peor que ninguno.

**`practice_attendance` no se crea.** Nunca existió como tabla; se elimina de `docs/02` (D-052-02).

## 2. Estructura de archivos

```
packages/domain/src/practice/
  grid.ts           grillaInicial, chukkersPorPersona, validarGrilla, puedeCerrar
  __tests__/

apps/api/src/practices/
  grid.service.ts       ver, ajustar, marcarAusente, cerrar, reabrir, resultado
  grid.controller.ts
  teams.service.ts      ← `aprobar` crea la grilla, en su misma transacción

apps/web/src/features/practices/
  grilla/               la matriz, recorrida por jugador
```

## 3. Contratos clave (Zod)

```ts
const CeldaResponse = z.object({
  chukker: z.number().int(),
  equipo: z.enum(["A", "B"]),
  position: z.number().int(),
  persona: z.object({ personId: z.string(), fullName: z.string() }).nullable(),
});

const GridResponse = z.object({
  chukkers: z.number().int(),
  cerrada: z.boolean(),
  celdas: z.array(CeldaResponse),
  /** Contado de las celdas, nunca guardado (R-052-02). Viaja para que la pantalla no lo recalcule
   *  distinto a como lo hará el cobro de Fase 3. */
  chukkersPorPersona: z.array(
    z.object({ personId: z.string(), fullName: z.string(), chukkers: z.number().int() }),
  ),
  resultado: z.object({ golesA: …, golesB: …, notas: … }).nullable(),
});

/** Ajustar es mandar **los cambios**, no la grilla entera. Ver abajo por qué. */
const AdjustGridRequest = z.object({
  cambios: z
    .array(
      z.object({
        chukker: z.number().int(),
        equipo: z.enum(["A", "B"]),
        position: z.number().int(),
        personId: z.string().nullable(),
      }),
    )
    .min(1)
    .max(64),
});
```

### Por qué acá sí van «cambios», si en `051` se decidió lo contrario

En `051` ajustar equipos manda **la composición entera**, y la razón está escrita: dos pestañas
mandando movimientos incrementales sobre estados distintos producen un equipo que ninguna de las dos
vio.

Acá se hace al revés **a propósito**, porque la forma del dato es otra. Un equipo es una
composición: mover a alguien de A a B cambia dos cosas a la vez, y media composición no significa
nada. Una grilla es una matriz de celdas **independientes**: que uno corrija el chukker 3 y otro el
chukker 5 no es un conflicto que haya que resolver, es dos correcciones que las dos son ciertas.
Mandar la grilla entera las convertiría en un conflicto artificial, y el que llegara segundo borraría
trabajo ajeno sin decirlo.

El lote sigue siendo **atómico**: se aplican todos los cambios o ninguno. Eso no es por concurrencia,
es por R-052-04 — y ahí está el escalón de este módulo, en §6.

## 4. Permisos

**Ninguno nuevo.** `practice.manage` cubre llenar, corregir, cerrar y reabrir: la grilla es parte de
la práctica y la maneja quien la maneja. Como en `051`, que el test de conjunto exacto de permisos
no se toque es la señal de que el permiso estaba bien pensado.

Lo que **sí** cambia es quién ve qué: la grilla de una práctica es visible para cualquiera con sesión
en el club, sin permiso especial. No hay nada sensible en ella —los equipos ya son públicos desde que
se aprobaron— y esconderla obligaría a un jugador a preguntar por WhatsApp cuántos chukkers jugó, que
es justamente el problema que el módulo viene a resolver.

## 5. La grilla al aprobar

`TeamsService.aprobar` crea la grilla **en su misma transacción**, por la razón de `051` T-621
aplicada de nuevo: dos transacciones separadas dejan equipos aprobados sin grilla el día que un
proceso se muera entre las dos, y esa práctica no se puede cerrar nunca.

Consecuencia deliberada: si crear la grilla falla, **la aprobación se cae con ella**. Es el
comportamiento correcto, y hay un test que lo comprueba forzando el fallo.

### Aprobar **no** es terminal, y eso decide el esquema

Se escribió este plan dando por hecho que aprobar cerraba el asunto. Es falso, y comprobarlo cambió
una llave foránea: `051` permite **aprobar de nuevo** —«una práctica se reacomoda hasta último
momento y la plataforma no puede ser más rígida que la cancha»— y volver a proponer hace
`deleteMany` sobre los equipos, con los puestos cayendo por cascada.

De ahí salen dos decisiones:

1. **La celda guarda `team` como coordenada, no `practiceTeamId` como llave foránea.** Con la llave,
   el primer comisario que rearmara equipos se llevaría por delante la grilla entera —por cascada, en
   silencio, sin un error que lo delatara—. «Equipo A, puesto 2, chukker 4» es **un lugar en la
   cancha**, y los lugares no dejan de existir porque cambie quién los ocupa.
2. **La grilla se crea en la primera aprobación y las siguientes no la tocan.** Si ya hay celdas, se
   dejan como están. Aprobar de nuevo después de haber corregido la grilla a mano **no borra las
   correcciones**, que es lo único que un comisario no perdonaría.

Queda una consecuencia que conviene mirar de frente: tras un rearme, la grilla puede tener a alguien
que ya no está en ningún equipo. **No es una inconsistencia, es el módulo funcionando.** Los equipos
dicen quién iba a jugar; la grilla dice quién jugó, y R-052-05 ya permite en una celda a cualquier
persona activa del club. Que diverjan es exactamente para lo que existen por separado.

## 6. Riesgos técnicos de este plan

| Riesgo | Cómo se ataca |
|---|---|
| **Intercambiar dos jugadores viola el `UNIQUE` en el estado intermedio.** Poner a Ana donde está Luis choca antes de que Luis se mueva. Es **el mismo escalón que ya se pisó en `051` T-632** con `(team, position)`. | Dos pasadas dentro de la transacción: primero se vacían todas las celdas que el lote toca, después se llenan. El test es el intercambio de dos jugadores en el mismo chukker, que es el caso que falla con una sola pasada. |
| **El `no_show` y las celdas se contradicen** (R-052-03), y el número que va a cobrar Fase 3 depende de cuál se mire. | No hay constraint que cruce dos tablas, así que se sostiene en el servicio y se prueba **en los dos sentidos**: marcar ausente vacía sus celdas en la misma transacción, y poner en una celda a alguien marcado ausente se rechaza. |
| **Cerrar mientras alguien edita.** Un `PATCH` en vuelo se aplica sobre una práctica que acaba de cerrarse, y entra un cambio en una grilla congelada. | `SELECT … FOR UPDATE` sobre la práctica en cerrar, reabrir y ajustar, con la lección de `030` T-332: leer dentro de la transacción **no serializa** en `READ COMMITTED`. |
| **La grilla infla los listados.** Traer prácticas con sus 48 celdas cada una revienta el presupuesto de la interfaz. | La grilla **sólo** sale en `GET /practices/:id/grid`, nunca embebida en un listado. Hay un test de contrato del listado que comprueba que no aparece. |
| **`chukkersPorPersona` se implementa dos veces** —una en el servidor y otra en la pantalla— y dan distinto el día que haya un caso raro. | La cuenta viaja calculada en la respuesta y la pantalla **la muestra, no la calcula**. La función vive en `packages/domain` y es la misma que usará el cobro. |
| **Un rearme de equipos se lleva la grilla por cascada**, en silencio y sin error. | La celda no tiene llave foránea al equipo (§5). Hay un test que corrige la grilla a mano, rearma y vuelve a aprobar, y comprueba que **las correcciones siguen ahí**. |
| **Una migración con `UNIQUE` sobre una tabla nueva es fácil**, pero Prisma tiene antecedentes en este repo. | Se revisa el SQL generado a mano antes de aplicarlo, con la advertencia de `030` sobre `DROP DEFAULT` en columnas GENERATED. |

## 7. La pantalla, que es lo difícil

`spec.md` §10 dice que ésta es la pantalla más difícil del producto hasta ahora y que el plan tiene
que resolverla. Una matriz de 8 puestos × 8 chukkers en un celular no se resuelve con una tabla:
son 64 objetivos táctiles de menos de 40 píxeles, al sol y con guantes.

**Se recorre por jugador, no por celda.** Una fila por persona, con su nombre y sus chukkers como
fichas de 44 píxeles que se apagan y se prenden con un toque. Ocho filas de seis fichas es una lista
vertical corriente en un celular, y la corrección más común —«Ana no jugó el cuarto»— es **un solo
toque en la fila de Ana**.

La sustitución —«entró Pedro por Luis»— es la acción menos frecuente y la más cara, así que no
compite por el espacio: vive detrás de la fila del jugador, y al elegir a Pedro se traspasan los
chukkers marcados. La cuenta de cada uno se actualiza en su fila, en vivo, que es la única
comprobación que el comisario va a hacer antes de cerrar.

## 8. Qué genera `tasks.md`

- **A. Dominio** — la grilla inicial, la cuenta por persona, la invariante y el cierre contra el reloj.
- **B. Datos** — dos entidades, el estado `played`, el cierre en `practice`, y la migración.
- **C. API** — ver, ajustar, ausente, cerrar, reabrir, resultado; y la grilla al aprobar equipos.
- **D. Interfaz** — la grilla recorrida por jugador, y la fila del jugador en el detalle.
- **E. Cierre** — E2E, aislamiento, y `verification.md`.
