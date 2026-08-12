# SPEC-050 — Prácticas oficiales (publicación, postulación y decisión)

> Estado: ready · Depende de: 010, 020, 030, 040 · Fuente: `docs/source` §7, `docs/02` §E,
> `docs/08` §2, `docs/09` Q-08, decisiones de Daniel del 2026-08-11 (§13)

**Éste es el módulo por el que existe el producto.** Las prácticas son el día a día del club y donde
más se siente el desorden de WhatsApp. Con 010, 040 y esto, el club puede dejar de coordinar por
mensajes.

El capítulo de prácticas del documento fuente trae ocho cosas. **Este spec cubre cuatro**, por
decisión del 2026-08-11: publicar, postularse, retirarse, y que el sistema decida solo a la hora de
cierre. El armado de equipos, el balanceo, la grilla de chukkers y la asistencia van en `051` — se
apoyan en lo que este módulo produce y no al revés.

## 1. Problema

Hoy una práctica se organiza así: alguien escribe en un grupo de WhatsApp «práctica el jueves a las
4, ¿quién juega?». Las respuestas llegan mezcladas con otras conversaciones. Alguien lleva la cuenta
de cabeza. A las 6:00 p.m. alguien decide si hay o no hay, y vuelve a escribir. Las consecuencias
son concretas:

- **Nadie sabe cuántos van.** El que organiza cuenta mensajes hacia atrás, y se equivoca.
- **La gente prepara caballos para una práctica que no se hizo.** Mover caballos cuesta tiempo y
  plata, y enterarse tarde es el reclamo más común.
- **El que contestó primero no tiene ninguna ventaja sobre el que contestó último**, y eso genera
  discusiones que nadie quiere tener.
- **No queda registro.** Cuántas prácticas jugó cada quien en el semestre no se puede responder.

## 2. Resultado esperado

El club publica una práctica con su cancha, su hora y sus cupos. Los jugadores que califican la ven
en su tablero y se postulan con un clic, diciendo cuántos chukkers pueden cubrir. **A la hora de
decisión el sistema confirma o cancela solo, sin que nadie tenga que acordarse**, y le avisa a
todos.

Y la cancha queda ocupada desde que la práctica se publica: **no se puede programar nada encima**,
porque la práctica reserva por el mismo camino que todo lo demás (`specs/040`).

## 3. Fuera de alcance (en esta versión)

Todo lo siguiente es `051`, y se declara aquí para que nadie lo asuma incluido:

- **El armado y balanceo de equipos.** Necesita postulaciones reales para tener sentido, y hoy no
  existen. `handicapDelEquipo` ya está construido y probado en `specs/030` esperándolo.
- **La grilla de chukkers y el asistente de balance en vivo.**
- **La asistencia real y el resultado.**
- **El peso deportivo del medio hombre** (que el puesto compartido cuente el más alto de los dos).
  El **vínculo** entre los dos jugadores sí entra aquí — ver §4 y R-050-08.

Y fuera de `051` también:

- **Cobros, penalizaciones y devoluciones.** Bajarse de una práctica confirmada tiene consecuencias
  económicas; son `specs/100` y `specs/110` (Fase 3). Aquí una práctica no cuesta nada.
- **La ventana de 60 minutos para reclamar un cupo liberado** (`docs/09` Q-13). Es de clases: aquí
  el orden de llegada resuelve solo quién entra cuando alguien se retira (ver R-050-06).
- **Prácticas que se repiten** («todos los jueves»). Se crea una por una hasta que el volumen
  justifique lo otro.

## 4. Actores

| Actor | Qué hace aquí |
|---|---|
| `club_admin` | crea, publica, edita y cancela prácticas |
| `commissioner` | lo mismo: la práctica es su terreno (`docs/source` §7) |
| Jugador | ve las prácticas para las que califica, se postula, se retira |
| Estudiante | igual, **pero sólo ve las prácticas hasta el nivel para el que lo habilitaron** |
| Acudiente | se postula y se retira en nombre de un menor a su cargo |

## 5. Historias de usuario

### HU-050-01 — Publicar una práctica
**Como** administrador **quiero** publicar una práctica con su cancha, hora y cupos **para** que los
jugadores sepan qué hay y se postulen.

- **Dado** una cancha libre, **cuando** se publica una práctica de 4:00 a 6:00 p.m., **entonces**
  queda visible en el calendario y **la cancha queda ocupada** en esa franja.
- **Dado** una cancha con algo programado encima, **cuando** se intenta publicar, **entonces** se
  rechaza diciendo con qué choca (`specs/040` R-040-04).
- **Dado** una práctica, **cuando** la hora de cierre de postulaciones es posterior a la hora de
  decisión, **entonces** se rechaza: no se puede decidir antes de dejar de recibir postulados.
- **Dado** una práctica en borrador, **cuando** nadie la ha publicado, **entonces** **no** aparece en
  ningún tablero ni ocupa cancha.

### HU-050-02 — Postularse
**Como** jugador **quiero** postularme con un clic **para** que quede constancia de que voy.

- **Dado** una práctica publicada, **cuando** un jugador se postula diciendo que cubre 4 chukkers,
  **entonces** queda postulado con su posición según el orden de llegada.
- **Dado** un jugador ya postulado, **cuando** se postula de nuevo, **entonces** se rechaza.
- **Dado** una práctica cuya hora de cierre ya pasó, **cuando** alguien intenta postularse,
  **entonces** se rechaza.
- **Dado** un estudiante habilitado hasta 4 goles, **cuando** mira el tablero, **entonces** **no ve**
  las prácticas de nivel superior, ni puede postularse a ellas aunque conozca el enlace.
- **Dado** un jugador de 8 goles y una práctica sugerida para 2 a 6, **cuando** se postula,
  **entonces** **se acepta**: el rango orienta, no prohíbe (R-050-04).

### HU-050-03 — Retirarse
**Como** jugador **quiero** poder retirarme antes del cierre **para** no dejar a nadie contando
conmigo.

- **Dado** un jugador postulado, **cuando** se retira antes del cierre, **entonces** deja de contar
  y **el siguiente de la lista pasa a estar dentro**, sin que nadie haga nada.
- **Dado** un jugador retirado, **cuando** se vuelve a postular, **entonces** entra **al final** de
  la fila, no en su lugar anterior.
- **Dado** una práctica cuya hora de cierre ya pasó, **cuando** alguien intenta retirarse,
  **entonces** se rechaza — a esa altura bajarse ya tiene consecuencias, y esas las decide `110`.

### HU-050-04 — La práctica se decide sola
**Como** club **quiero** que a la hora de decisión el sistema confirme o cancele **para** que nadie
tenga que acordarse y nadie prepare caballos en vano.

- **Dado** una práctica con mínimo 6 y 7 postulados dentro, **cuando** llega la hora de decisión,
  **entonces** se confirma y **se les avisa a todos**.
- **Dado** una práctica con mínimo 6 y 4 postulados, **cuando** llega la hora de decisión,
  **entonces** se cancela, se libera la cancha, y **se les avisa a los 4**.
- **Dado** una práctica ya decidida, **cuando** el proceso vuelve a pasar, **entonces** no hace nada
  ni avisa dos veces (R-050-10).
- **Dado** que el servidor estuvo caído a la hora de decisión, **cuando** vuelve, **entonces** la
  práctica se decide igual, tarde pero se decide (R-050-11).

### HU-050-05 — Compartir puesto (medio hombre)
**Como** jugador sin caballos suficientes **quiero** postularme compartiendo puesto con otro
**para** poder jugar igual.

- **Dado** un jugador que se postula proponiendo a otro como compañero, **cuando** el otro acepta,
  **entonces** los dos ocupan **un solo puesto**.
- **Dado** una propuesta que el otro no ha aceptado, **cuando** se cuentan los cupos, **entonces** la
  pareja **no cuenta todavía**: una propuesta no aceptada no reserva nada.
- **Dado** una pareja formada, **cuando** uno de los dos se retira, **entonces** el otro queda como
  postulado individual, en la misma posición de la fila.

## 6. Reglas de negocio

- `R-050-01` **Una práctica ocupa una cancha, y la ocupa por el mismo camino que todo lo demás.** La
  reserva se crea en la misma transacción que la práctica (`specs/040`). Sin cancha libre no hay
  práctica.
- `R-050-02` **La hora de cierre nunca es posterior a la hora de decisión.** Ambas se pueden fijar
  por práctica; su valor por defecto sale de `settings` (`docs/08`: `practice.decision_time`,
  `practice.applications_close_offset_hours`).
- `R-050-03` **Una práctica en borrador no existe para nadie más**: no aparece en tableros, no ocupa
  cancha, no acepta postulados.
- `R-050-04` **El rango de handicap orienta; no prohíbe.** Decidido el 2026-08-11. Se muestra en la
  práctica y cualquiera puede postularse.
- `R-050-05` **La habilitación del estudiante sí es un filtro duro.** Un estudiante sólo ve y sólo
  puede postularse a prácticas cuyo nivel no supere el que su profesor le habilitó
  (`docs/02` §B, `practice_eligibility`). No es una preferencia: es seguridad.
- `R-050-06` **Quién está dentro se decide por orden de llegada.** Decidido el 2026-08-11. Los
  primeros `target_players` **puestos** quedan dentro; el resto, en lista de espera por el mismo
  orden. **No se materializa nada**: la posición es una función del orden de postulación, así que un
  retiro promueve al siguiente sin que corra ningún proceso (ver §9).
- `R-050-07` **Un puesto no es una persona.** Una pareja de medios hombres ocupa un puesto. Los
  cupos se cuentan en puestos.
- `R-050-08` **El medio hombre exige reciprocidad.** Una propuesta sin aceptar no forma pareja y no
  ocupa puesto.
- `R-050-09` **Después del cierre no se entra ni se sale.** Lo que pase después de esa hora es
  materia de políticas de cancelación (`specs/110`), no de este módulo.
- `R-050-10` **La decisión es idempotente.** Correrla dos veces no cambia nada ni avisa dos veces.
- `R-050-11` **Una hora de decisión que pasó mientras el sistema estaba caído se ejecuta igual.** La
  decisión no se programa: se busca lo que ya venció (ver §9).
- `R-050-12` **Cancelar libera la cancha.** Una práctica cancelada no puede seguir ocupando una
  franja que el club podría usar.
- `R-050-13` **Nadie ve las postulaciones de una práctica ajena a su club** (P-05), y la lista de
  postulados de una práctica **es visible para quien puede postularse a ella**: saber quiénes van es
  la mitad de la decisión de ir.

## 7. Datos

De `docs/02` §E, ya previstas: **`practice`** y **`practice_application`**. De §B:
**`practice_eligibility`**, que **todavía no existe** y este módulo necesita — se propone aquí y se
agrega a `docs/02` al aceptar el spec.

Las tablas de `051` —`practice_team`, `practice_slot`, `chukker_grid_cell`, `practice_attendance`,
`practice_result`— **no se crean todavía**. Una tabla vacía durante meses es una invitación a que
alguien la llene con otra cosa.

`practice.price_policy_id` queda **declarado y sin usar** hasta Fase 3, con el mismo criterio que
`handicap_history.on_behalf_of_id` en `specs/030`.

## 8. Interfaz

```
POST   /practices                        practice.manage   { fieldId, startsAt, endsAt, chukkers, … }
GET    /practices?desde=&hasta=          sesión            → las que YO puedo ver (R-050-05)
GET    /practices/:id                    sesión            → con sus postulados (R-050-13)
PATCH  /practices/:id                    practice.manage   { … } sólo en borrador o publicada
POST   /practices/:id/publish            practice.manage   → reserva la cancha
POST   /practices/:id/cancel             practice.manage   { reason } → libera la cancha
POST   /practices/:id/applications       sesión            { chukkersOffered, halfManPartnerPersonId?, onBehalfOfPersonId? }
DELETE /practices/:id/applications/mine  sesión            → retirarse
POST   /practices/:id/applications/mine/accept-partner  sesión → aceptar ser medio hombre
```

`practice.manage` es un permiso nuevo. Lo tienen el administrador del club **y el comisario** — a
diferencia de `handicap.edit`, aquí los dos mandan, porque el documento fuente dice «el
administrador del club (o el comisario) crea la práctica».

## 9. Dominio puro

```ts
/** Quién está dentro y quién en lista de espera, dado el orden de llegada (R-050-06). */
function repartirCupos(
  postulaciones: readonly Postulacion[],
  puestos: number,
): { dentro: readonly Puesto[]; enEspera: readonly Puesto[] }

/** Agrupa postulaciones sueltas y parejas recíprocas en puestos (R-050-07, R-050-08). */
function armarPuestos(postulaciones: readonly Postulacion[]): readonly Puesto[]

/** ¿Esta persona puede ver y postularse a esta práctica? (R-050-04, R-050-05) */
function puedePostularse(
  quien: { handicapHalves: HandicapHalves; topeDeEstudiante: HandicapHalves | null },
  practica: { nivelMaximoHalves: HandicapHalves | null },
): Result<void, RechazoDePostulacion>

/** ¿Confirmar o cancelar? Sólo mira números y el reloj inyectado (P-08). */
function decidirPractica(
  practica: { minimo: number; decisionAt: Date; estado: EstadoDePractica },
  puestosDentro: number,
  ahora: Date,
): Decision  // "confirmar" | "cancelar" | "todavia_no" | "ya_decidida"

/** La ventana de postulación, con sus dos bordes. */
function estaAbiertaLaPostulacion(practica: { closeAt: Date }, ahora: Date): boolean
```

**`decidirPractica` no escribe ni avisa.** Devuelve qué hay que hacer; hacerlo es del servicio. Es lo
que permite probar los cuatro casos —incluida la práctica ya decidida— sin base de datos.

## 10. Pantallas

| Pantalla | Qué decisión permite tomar |
|---|---|
| Tablero de prácticas | «¿hay práctica esta semana y me sirve?» — sólo las que la persona puede ver |
| Detalle de una práctica | «¿voy?»: cuántos van, quiénes, y si estoy dentro o en espera |
| Crear/publicar práctica | armar la semana del club |
| Mis postulaciones | «¿a qué me anoté?» |

El detalle **dice explícitamente si estás dentro o en la lista de espera, y en qué posición**. Un
tablero que sólo dice «postulado» deja a la gente sin saber si preparar los caballos, que es
exactamente el problema que este módulo viene a resolver.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| **La decisión no corre** —servidor caído, proceso muerto— y el club se queda esperando un aviso que nunca llega. | No se programa nada: se consulta `decision_at <= ahora AND status = published`. Una decisión atrasada se ejecuta al volver. Hay un test que simula el sistema caído. |
| **Se avisa dos veces**, o se avisa a medias porque el aviso salió y la práctica no quedó confirmada. | La decisión y el encolado del aviso van en **la misma transacción** (P-11), y el cambio de estado es la condición de la consulta: si ya está confirmada, no vuelve a entrar. |
| **Dos personas se postulan a la vez por el último cupo.** | Con orden de llegada **no hay último cupo**: todos entran a la fila y el corte se calcula al leer. Es la propiedad que hace que esta política sea, además de justa, la más simple de implementar bien. |
| **La cancha queda ocupada por una práctica cancelada.** | Cancelar libera en la misma transacción, y hay un test que lo comprueba programando algo encima inmediatamente después. |
| **El estudiante se cuela por el enlace directo.** | El filtro se aplica en el servicio, no en el listado. Hay un test que pide la práctica por su identificador. |
| **La práctica se publica sin que la cancha esté libre**, y el choque aparece el día de la práctica. | La reserva se crea al publicar, no al empezar. Un choque impide publicar. |

## 12. Definición de terminado

- [ ] Criterios de aceptación de cada HU cubiertos por un test con nombre legible en español
- [ ] Test de aislamiento de tenant en todas las rutas
- [ ] Test de autorización en cada endpoint, con rol permitido y rol denegado
- [ ] Test de la decisión **con el sistema caído** y de que **no avisa dos veces**
- [ ] `docs/02-domain-model.md` con `practice_eligibility`
- [ ] `docs/08-configuration-catalog.md` con los valores que este módulo lee

## 13. Decisiones tomadas el 2026-08-11

| # | Pregunta | Decisión |
|---|---|---|
| D-050-01 | ¿Qué entra en la v1? | **Publicar, postularse, retirarse y decidir solo.** Equipos, grilla y asistencia van en `051` |
| D-050-02 | ¿El rango de handicap filtra? | **Orienta a todos; filtra duro sólo al estudiante**, hasta el nivel que le habilitaron |
| D-050-03 | ¿Quién entra si sobran postulados? | **Orden de llegada**, con lista de espera; un retiro promueve al siguiente |
| D-050-04 | ¿El medio hombre entra ya? | **Sí, al postularse**, con aceptación del compañero. Su peso deportivo es de `051` |
