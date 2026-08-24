# SPEC-051 — Equipos y balanceo

> Estado: ready · Depende de: 030, 050 · Fuente: `docs/source` §7, `docs/02` §E,
> decisiones de Daniel del 2026-08-24 (§13)

Sale de `specs/050`, donde se separó a propósito: el balanceo no tiene sentido sin postulaciones
reales que balancear, y ahora las hay.

Es el módulo que hace útil todo lo anterior. Los handicaps de `030` existen para esto; las
postulaciones de `050` terminan acá. **Es la primera vez que el producto toma una decisión
deportiva** en vez de registrar la que alguien ya tomó.

## 1. Problema

Hoy, con los jugadores confirmados, alguien arma los equipos de cabeza. Las consecuencias son las
de siempre en el polo:

- **Los equipos quedan desparejos** y el partido se arruina. Sumar handicaps de ocho personas
  mentalmente, en la cancha, con la gente esperando, es más difícil de lo que parece.
- **Se discute.** Sin un número visible, cualquier reparto se puede leer como favoritismo.
- **Nadie sabe con quién juega hasta que llega**, así que nadie puede coordinar caballos ni llegar
  con una idea de lo que va a pasar.

Y una que sólo se nota después: **no queda registro de quién jugó con quién.** Cuando el comité
quiera revisar handicaps a fin de semestre, no hay con qué.

## 2. Resultado esperado

Cuando una práctica se confirma, **el sistema deja armados los dos equipos más parejos posibles**
según el handicap elegido para esa práctica. El comisario los revisa, mueve a quien quiera viendo
en todo momento cómo cambia la diferencia, y aprueba. Recién ahí los jugadores los ven.

Y el reparto es **explicable**: dos personas mirando los mismos handicaps llegan al mismo
resultado, porque el criterio es uno solo y está escrito.

## 3. Fuera de alcance (en esta versión)

- **La grilla de chukkers.** Quién juega cada chukker, celda por celda. Va en `052`: sirve para
  reflejar lo que pasó, no para decidir lo que va a pasar, y se diseña mejor con equipos reales
  que reflejar.
- **La asistencia real y el resultado.** Mismo módulo que la grilla — la estadística por jugador se
  cuenta desde la grilla (`docs/02` §E), así que separarlas no tendría sentido.
- **El reparto del cobro entre medios hombres.** La regla **deportiva** del medio hombre sí entra
  acá; la económica es Fase 3, con pagos. La columna queda prevista.
- **Equipos en copas.** Son `060`, y ahí las reglas son otras: siempre 4 contra 4, y los planteles
  se congelan al arrancar.

## 4. Actores

| Actor | Qué hace aquí |
|---|---|
| `commissioner` | ajusta y **aprueba** los equipos. Es su decisión |
| `club_admin` | lo mismo: la práctica es de los dos (`specs/050`) |
| Jugador | ve los equipos **después** de que se aprueban, con el suyo destacado |

## 5. Historias de usuario

### HU-051-01 — Los equipos se proponen solos
**Como** club **quiero** que al confirmarse una práctica ya haya una propuesta de equipos **para**
que nadie tenga que armarlos de cero con la gente esperando.

- **Dado** una práctica que se confirma con 8 puestos, **cuando** el sistema la decide, **entonces**
  quedan dos equipos propuestos con 4 puestos cada uno.
- **Dado** los handicaps de esos 8 puestos, **cuando** se propone el reparto, **entonces** es el que
  **minimiza la diferencia** entre las sumas de los dos equipos.
- **Dado** el mismo conjunto de jugadores, **cuando** se propone dos veces, **entonces** el
  resultado es **idéntico**: el criterio no depende del orden en que llegaron los datos.
- **Dado** una práctica que se cancela, **cuando** el sistema la decide, **entonces** **no** se
  proponen equipos.
- **Dado** un número impar de puestos, **cuando** se propone, **entonces** los equipos quedan con
  una diferencia de un puesto y el sistema elige de qué lado.

### HU-051-02 — El comisario ajusta y aprueba
**Como** comisario **quiero** mover jugadores viendo cómo cambia la diferencia **para** decidir con
el número a la vista en vez de a ojo.

- **Dado** una propuesta, **cuando** el comisario mueve un jugador al otro equipo, **entonces** las
  dos sumas y la diferencia se actualizan de inmediato.
- **Dado** unos equipos ajustados, **cuando** el comisario aprueba, **entonces** quedan publicados y
  **se les avisa a los jugadores**.
- **Dado** unos equipos ya aprobados, **cuando** el comisario los vuelve a cambiar, **entonces** se
  puede, y **queda registrado quién y cuándo** — una práctica se reacomoda hasta último momento y
  la plataforma no puede ser más rígida que la cancha.
- **Dado** un jugador, **cuando** intenta aprobar equipos, **entonces** se rechaza.

### HU-051-03 — El medio hombre pesa el más alto
**Como** club **quiero** que un puesto compartido cuente el handicap más alto de los dos **para**
que el balanceo refleje lo que de verdad va a pasar en la cancha.

- **Dado** un puesto compartido entre un jugador de 2 y otro de 4, **cuando** se calcula el
  handicap de su equipo, **entonces** ese puesto pesa **4** — ni la suma ni el promedio.
- **Dado** ese mismo puesto, **cuando** se muestra, **entonces** se ven **los dos nombres**: quien
  mira tiene que entender por qué ese puesto pesa lo que pesa.

### HU-051-04 — Ver con quién juego
**Como** jugador **quiero** ver los equipos aprobados **para** saber con quién juego y contra quién.

- **Dado** unos equipos aprobados, **cuando** un jugador abre la práctica, **entonces** ve los dos
  equipos, con el suyo señalado.
- **Dado** una propuesta **sin aprobar**, **cuando** un jugador abre la práctica, **entonces** **no
  ve nada de equipos**: un borrador que cambia se lee como una decisión en su contra (R-051-05).

## 6. Reglas de negocio

- `R-051-01` **Sólo se arman equipos de una práctica confirmada.** Una cancelada no los tiene, y una
  que todavía no se decidió tampoco.
- `R-051-02` **El reparto minimiza la diferencia entre las sumas de handicap**, y nada más. Decidido
  el 2026-08-24: no interviene cuántos chukkers puede cubrir cada uno — eso se resuelve en la
  grilla (`052`).
- `R-051-03` **Los equipos quedan del mismo tamaño**, o con una diferencia de un puesto si el número
  es impar. El comisario puede dejarlos desparejos a mano; el sistema no lo propone solo.
- `R-051-04` **El reparto es determinista**: mismos handicaps, mismo resultado, sin importar el
  orden de los datos. Es lo que permite explicarlo cuando alguien pregunte.
- `R-051-05` **Una propuesta sin aprobar no la ve nadie más que quien puede aprobarla.** Decidido el
  2026-08-24.
- `R-051-06` **Un puesto compartido pesa el handicap más alto de los dos** (`docs/source` §7).
- `R-051-07` **Aprobar avisa; reacomodar después también.** Quien se enteró de un equipo tiene
  derecho a enterarse de que cambió.
- `R-051-08` **Todo cambio de equipos queda registrado**: quién y cuándo. Es de las cosas que se
  discuten, y el registro es lo que corta la discusión.
- `R-051-09` **El handicap que se usa es el que eligió la práctica** —internacional o del club— y se
  lee **en el momento de proponer**. Un cambio de handicap posterior no reacomoda equipos ya
  armados: eso es exactamente lo que `specs/030` R-030-06 promete al no tener fechas de vigencia.

## 7. Datos

De `docs/02` §E, ya previstas: **`practice_team`** y **`practice_slot`**.

Las de la grilla —`chukker_grid_cell`, `practice_attendance`, `practice_result`— **no se crean
todavía**, con el mismo criterio que en `050`: una tabla vacía durante meses es una invitación a
que alguien la llene con otra cosa.

`practice_slot.cost_share_primary_pct` queda **declarado y sin usar** hasta Fase 3.

## 8. Interfaz

```
GET   /practices/:id/teams              sesión           → los equipos, si están aprobados (R-051-05)
POST  /practices/:id/teams/propose      practice.manage  → recalcula la propuesta desde cero
PATCH /practices/:id/teams              practice.manage  { movimientos } → ajusta sin aprobar
POST  /practices/:id/teams/approve      practice.manage  → publica y avisa
```

`propose` existe además del automático porque el comisario tiene que poder **descartar sus propios
ajustes y volver a empezar**, que es lo primero que se pide cuando uno se enreda moviendo gente.

## 9. Dominio puro

```ts
/** El handicap de un puesto: el más alto de los dos si es compartido (R-051-06). */
function handicapDelPuesto(titular: HandicapHalves, companero: HandicapHalves | null): HandicapHalves

/**
 * El reparto más parejo posible (R-051-02, R-051-03, R-051-04).
 *
 * No sabe de personas ni de prácticas: recibe pesos con identificador y devuelve dos grupos.
 */
function balancearEquipos(
  puestos: readonly { id: string; handicapHalves: HandicapHalves }[],
): { equipoA: readonly string[]; equipoB: readonly string[]; diferenciaHalves: number }
```

`balancearEquipos` **no elige el mejor de forma aproximada**. «Lo más parejo posible» es una promesa
que conviene cumplir literalmente, porque es exactamente lo que alguien va a auditar cuando no le
guste su equipo. El plan explica por qué el reparto exacto sale barato.

## 10. Pantallas

| Pantalla | Qué decisión permite tomar |
|---|---|
| Equipos de la práctica (comisario) | mover gente **viendo la diferencia cambiar**, y aprobar |
| Equipos en el detalle de la práctica (jugador) | «¿con quién juego?», una vez aprobados |

El asistente de balance no es una pantalla aparte: **es el número al lado de cada equipo**. Que la
diferencia se actualice al mover a alguien es la función entera.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| **El reparto «óptimo» tarda demasiado** con muchos jugadores. | Con programación dinámica el reparto exacto cuesta lo mismo para 8 que para 40 jugadores, así que **no hay camino aproximado ni dos comportamientos que explicar**. Hay un test con el máximo que permite el contrato. |
| **Dos propuestas distintas para los mismos jugadores**, y nadie puede explicar por qué. | Determinismo probado: el mismo conjunto desordenado da el mismo resultado. |
| **Se publica un borrador** y la gente se hace una idea que después cambia. | La propuesta no sale en ninguna respuesta hasta aprobarse, y el test serializa la respuesta completa buscando nombres — el criterio de `specs/040` T-451. |
| **Un cambio de handicap reacomoda equipos ya armados** y nadie entiende por qué. | El handicap se lee al proponer y **se guarda con el puesto**. Cambiarlo después no toca lo aprobado. |
| **El medio hombre se cuenta dos veces** al sumar el equipo. | Un puesto es una unidad, no dos personas. La suma recorre puestos; hay un test con un equipo entero de puestos compartidos. |

## 12. Definición de terminado

- [ ] Criterios de aceptación de cada HU cubiertos por un test con nombre legible en español
- [ ] Test de aislamiento de tenant en las cuatro rutas
- [ ] Test de autorización, con jugador **denegado** en aprobar
- [ ] Test de que una propuesta sin aprobar **no aparece** en ninguna respuesta a un jugador
- [ ] `docs/02-domain-model.md` actualizado si cambia algo de §E

## 13. Decisiones tomadas el 2026-08-24

| # | Pregunta | Decisión |
|---|---|---|
| D-051-01 | ¿Qué entra? | **Equipos y balanceo.** Grilla, asistencia y resultado van a `052` |
| D-051-02 | ¿Qué mira el balanceo? | **Sólo el handicap.** Los chukkers disponibles se resuelven en la grilla |
| D-051-03 | ¿Cuándo se arman? | **El sistema propone al confirmarse**; el comisario aprueba |
| D-051-04 | ¿Cuándo los ven los jugadores? | **Recién al aprobarse** |
