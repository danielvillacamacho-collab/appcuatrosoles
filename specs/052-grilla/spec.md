# SPEC-052 — Grilla de chukkers, asistencia y resultado

> Estado: done · Depende de: 050, 051 · Fuente: `docs/source` §7, `docs/02` §E,
> decisiones de Daniel del 2026-08-26 (§13)

Cierra el arco que abrió `050`. Una práctica hoy se publica, se decide y se le arman equipos —y
después **se evapora**. Este módulo es el que la deja escrita.

Es el primer módulo que no decide nada: **registra lo que pasó**. Y por eso mismo es del que
dependen los que sí deciden — el cobro por chukker de Fase 3, el handicap de `030`, y cualquier
estadística que el club quiera mirar.

## 1. Problema

Termina la práctica y lo que pasó se queda en la cabeza del comisario. Cuántos chukkers jugó cada
quien se reconstruye por WhatsApp dos días después, cuando hay que cobrar; quién no se presentó se
comenta pero no se anota; y si alguien dice «yo jugué cuatro, no seis», **no hay con qué
responderle** salvo la memoria de otro.

El costo no es sólo administrativo. Sin registro de juego, el comisario fija handicaps a ojo y las
bolsas se cobran por lo que se pidió, no por lo que se jugó.

## 2. Resultado esperado

Cuando el comisario aprueba los equipos, **la grilla ya existe y ya dice lo que normalmente pasa**:
los ocho juegan los seis chukkers, cada uno en su puesto. Una práctica sin novedades no exige ni un
toque.

Cuando sí hay novedades —el caballo de Ana se lastimó en el cuarto, entró Pedro por Luis— el
comisario las corrige desde el celular a la orilla de la cancha, en la grilla, viendo la fila de
cada jugador. Al terminar cierra la práctica, y con eso queda escrito, sin que nadie lo teclee dos
veces: **quién asistió, cuántos chukkers jugó cada uno, quién no llegó**, y —si al club le
interesa— cómo terminó.

## 3. Fuera de alcance (en esta versión)

- **Qué caballo juega cada chukker.** Decidido el 2026-08 (`docs/09`): no se modela en v1. La
  columna queda prevista y vacía, porque el día que entre `090` (caballos) la grilla es exactamente
  donde va.
- **Las consecuencias de no presentarse.** Cobrar igual, penalizar o bloquear postulaciones es Fase
  3, donde vive la plata y la política de cancelación (D-052-04). Acá sólo queda el registro.
- **El cobro por chukker jugado.** `specs/100`. Este módulo produce el dato del que ese cobro se
  alimenta, y nada más.
- **La estadística agregada por jugador o temporada** —promedios, rankings, «cómo viene Ana este
  año»—. Ésta es la **fuente**; la vista que la resume es su propio módulo, y se diseña mejor con
  un año de grillas reales que con cero.
- **Los partidos de copa.** Tienen marcador con consecuencias —tabla, fixture, desempates— y son
  `060`. Acá el resultado no le cambia nada a nadie.

## 4. Actores

| Rol | Puede |
|---|---|
| `commissioner` | llenar y corregir la grilla, marcar quién no llegó, cerrar y reabrir la práctica |
| `club_admin` | lo mismo: `practice.manage` es de los dos, porque una práctica es a la vez cosa deportiva y organización de la semana |
| jugador (sesión) | ver la grilla de una práctica que jugó, y cuántos chukkers le quedaron contados |

## 5. Historias de usuario

### HU-052-01 — La grilla nace llena
**Como** comisario **quiero** que la grilla ya exista al aprobar los equipos **para** no tener que
escribir lo que normalmente pasa.

- **Dado** unos equipos recién aprobados en una práctica de 6 chukkers con 8 puestos, **cuando** se
  aprueban, **entonces** la grilla queda con las 48 celdas puestas: cada puesto en todos los
  chukkers.
- **Dado** un puesto de medio hombre, **cuando** nace la grilla, **entonces** las celdas quedan a
  nombre del **titular**, porque quién de los dos entra en cada chukker es justamente lo que el
  comisario va a corregir (R-052-08).
- **Dado** una práctica cuyos equipos **no** están aprobados, **cuando** alguien pide la grilla,
  **entonces** no hay ninguna: sin equipos aprobados no hay puestos que poner en ella (R-052-01).

### HU-052-02 — Corregir las excepciones
**Como** comisario **quiero** cambiar quién jugó un chukker **para** que la grilla diga lo que de
verdad pasó y no lo que se esperaba.

- **Dado** la grilla abierta, **cuando** el comisario saca a alguien de un chukker, **entonces** esa
  celda queda vacía y su cuenta de chukkers baja en uno, en la misma pantalla.
- **Dado** un jugador que entra por otro, **cuando** el comisario lo pone en la celda, **entonces**
  la celda queda a su nombre y **el reemplazado no la conserva**.
- **Dado** alguien que ya está jugando el chukker 3 en el equipo A, **cuando** el comisario lo pone
  también en el chukker 3 del equipo B, **entonces** se rechaza: nadie juega dos veces el mismo
  chukker (R-052-04).
- **Dado** una práctica **cerrada**, **cuando** alguien intenta cambiar una celda, **entonces** se
  rechaza indicando que hay que reabrirla (R-052-06).

### HU-052-03 — Cerrar la práctica
**Como** comisario **quiero** cerrar la práctica **para** que lo registrado quede firme y sirva para
cobrar.

- **Dado** una práctica confirmada que ya empezó, **cuando** el comisario la cierra, **entonces**
  queda en `played`, con quién la cerró y cuándo, y la grilla deja de admitir cambios.
- **Dado** una práctica que **todavía no empezó**, **cuando** alguien intenta cerrarla, **entonces**
  se rechaza: no se registra como jugado algo que no ha ocurrido (R-052-07).
- **Dado** una práctica cerrada con un error, **cuando** el comisario la reabre, **entonces** vuelve
  a `confirmed`, la grilla se edita otra vez, y **la reapertura queda en la auditoría** con quién y
  cuándo (R-052-06).

### HU-052-04 — Quién no llegó
**Como** comisario **quiero** marcar al que no se presentó **para** que quede escrito, sin discutirlo
por WhatsApp tres días después.

- **Dado** un jugador aceptado que no apareció, **cuando** el comisario lo marca, **entonces** su
  postulación queda como `no_show` y **sus celdas quedan vacías de una vez**, sin tener que borrar
  seis a mano.
- **Dado** un jugador **marcado como ausente**, **cuando** alguien intenta ponerlo en una celda,
  **entonces** se rechaza: la grilla diría que estuvo y la marca dice que no, y las dos cosas no
  pueden ser ciertas (R-052-03).
- **Dado** un ausente marcado por error, **cuando** el comisario le quita la marca, **entonces**
  vuelve a estar aceptado y se le puede poner en la grilla. **Sus celdas no se restauran solas**: el
  sistema no sabe qué chukkers jugó, y devolverle los seis originales sería inventar el dato que el
  módulo existe para registrar.
- **Dado** alguien que **no estaba aceptado** en la práctica, **cuando** se lo intenta marcar como
  ausente, **entonces** se rechaza: no se presentó quien nunca fue esperado.

> **Corregido el 2026-08-27, al implementar.** Este criterio decía antes que marcar ausente a quien
> «sí jugó algún chukker» se rechazaba. Es incompatible con que la grilla **nazca llena**: todos
> tienen celdas desde el primer segundo, así que la regla habría hecho imposible marcar a nadie —
> justo lo contrario de la conveniencia que HU-052-04 promete. La invariante de R-052-03 se sostiene
> igual, pero **en la otra dirección**: marcar vacía las celdas, y estando marcado no se puede
> ocupar ninguna.

### HU-052-05 — Cómo terminó
**Como** comisario **quiero** anotar el marcador **para** dejarlo registrado cuando el club lo pide.

- **Dado** una práctica jugada, **cuando** el comisario anota 5 a 4, **entonces** queda guardado con
  su nota opcional.
- **Dado** una práctica **sin** marcador, **cuando** se cierra, **entonces** se cierra igual: el
  resultado es opcional y una práctica no es un partido (R-052-09).

### HU-052-06 — Cuántos chukkers jugué
**Como** jugador **quiero** ver cuántos chukkers me contaron **para** poder reclamar a tiempo si no
cuadra.

- **Dado** una práctica que jugué, **cuando** la abro, **entonces** veo mi fila de la grilla y mi
  cuenta de chukkers.
- **Dado** una práctica de **otro club**, **cuando** pido su grilla, **entonces** recibo 404, nunca
  403 (P-05).

## 6. Reglas de negocio

- `R-052-01` **La grilla existe sólo donde hay equipos aprobados.** Nace al aprobarse, en la misma
  transacción que la aprobación, por la razón de `051` T-621: dos transacciones separadas dejan
  prácticas aprobadas sin grilla el día que un proceso se muera entre una y otra.
- `R-052-02` **La grilla es la única fuente de quién jugó cuánto.** Los chukkers de una persona son
  sus celdas, contadas. No se guarda ese número en ninguna parte: un total guardado y una grilla
  editable se contradicen el primer día (D-052-02).
- `R-052-03` **Asistió quien tiene al menos una celda.** No hay una marca de asistencia aparte que
  pueda decir lo contrario. `no_show` es el caso explícito de quien fue aceptado y no apareció, y es
  incompatible con tener celdas.
- `R-052-04` **Nadie juega dos veces el mismo chukker.** Es la única invariante que la grilla no
  puede violar ni siquiera a mano, porque hace imposible contar.
- `R-052-05` **En una celda va cualquier persona activa del club**, no sólo los aceptados. Entra
  gente que no se postuló —eso es lo normal cuando falta uno—, y una grilla que no lo permita se
  llena mal o no se llena. Quien juega sin haberse postulado **queda en la grilla igual**, y de ahí
  lo toma el cobro de Fase 3.
- `R-052-06` **Una práctica cerrada no se edita; se reabre.** Reabrir es un acto explícito, con
  permiso, y queda en `audit_log`. La grilla abierta es un borrador y sus celdas se pueden vaciar;
  la cerrada es un hecho.
- `R-052-07` **No se cierra lo que no ha empezado.** Contra el reloj inyectado (P-08), nunca contra
  `new Date()`.
- `R-052-08` **El medio hombre suma sólo sus propias celdas.** Un puesto compartido es un puesto para
  el balanceo de `051` y **dos personas distintas** para la grilla: es justamente acá donde se separa
  quién de los dos jugó cada chukker.
- `R-052-09` **El resultado es opcional y no le cambia nada a nadie.** Si le cambiara algo, sería
  una copa y viviría en `060`.
- `R-052-10` **Cerrar no exige una grilla completa.** Un chukker vacío es un dato posible —se cortó
  la práctica por lluvia—, y exigir que esté llena obligaría a inventar celdas para poder cerrar.

## 7. Datos

De `docs/02` §E, previstas y **ahora sí creadas**: **`chukker_grid_cell`** y **`practice_result`**.

`practice` gana el cierre: quién cerró, cuándo, y el estado **`played`, que se declara acá**. El
esquema anticipaba que llegaría con `051` y no llegó, por la buena razón que el propio comentario
da: un estado que nada produce ni consume es una invitación a que alguien lo use para otra cosa.
Llega ahora, que es cuando algo lo produce.

**Se propone eliminar `practice_attendance` de `docs/02`.** Es consecuencia directa de D-052-02: su
`chukkers_played` sería una copia de lo que la grilla ya dice, y su `attended` una copia de si tiene
celdas. Las dos copias sólo pueden aportar una cosa —contradecirse—. El único dato que la tabla
guardaba y la grilla no es el `no_show`, y ése ya tiene lugar propio en `practice_application.outcome`,
donde `050` lo dejó declarado.

`chukker_grid_cell.horse_id` queda **declarada y sin usar** hasta `090`, igual que
`cost_share_primary_pct` en `051`.

## 8. Interfaz

```
GET   /practices/:id/grid      sesión           → la grilla, con los chukkers contados por persona
PATCH /practices/:id/grid      practice.manage  { cambios: [{ chukker, equipo, puesto, personId|null }] }
POST  /practices/:id/grid/no-show  practice.manage  { personId, ausente } → marca (y vacía sus celdas) o desmarca
POST  /practices/:id/close     practice.manage  → congela y pasa a played
POST  /practices/:id/reopen    practice.manage  → vuelve a confirmed, auditado
PUT   /practices/:id/result    practice.manage  { golesA, golesB, notas? }
```

`PATCH` recibe **una lista de cambios y no uno solo**, con la misma forma que el `PATCH` de equipos
de `051`. La razón es el sitio de uso: un celular a la orilla de la cancha, con señal mala, donde
seis toques tienen que poder viajar juntos y aplicarse o fallar juntos.

## 9. Dominio puro

```ts
/** La grilla que se espera: cada puesto en todos los chukkers (R-052-01). */
function grillaInicial(
  puestos: readonly { equipo: "A" | "B"; position: number; personId: string }[],
  chukkers: number,
): readonly Celda[]

/** Los chukkers de cada quien, contados de las celdas y de ningún otro lado (R-052-02). */
function chukkersPorPersona(celdas: readonly Celda[]): ReadonlyMap<string, number>

/** Nadie dos veces en el mismo chukker (R-052-04). */
function validarGrilla(celdas: readonly Celda[]): Result<void, ErrorDeGrilla>

/** Si se puede cerrar, contra el reloj inyectado (R-052-07). */
function puedeCerrar(
  practica: { estado: string; startsAt: Date },
  ahora: Date,
): Result<void, ErrorDeCierre>
```

`chukkersPorPersona` es la función de la que cuelga el módulo entero: es la que hace que el número
que ve el jugador, el que usa el handicap y el que va a cobrar Fase 3 **sean el mismo número**.

## 10. Pantallas

| Pantalla | Qué decisión permite tomar |
|---|---|
| Grilla de la práctica (comisario) | corregir lo que no salió como estaba previsto, **viendo la cuenta de cada jugador cambiar**, y cerrar |
| Grilla en el detalle de la práctica (jugador) | «¿me contaron bien?», que es la única pregunta que un jugador le va a hacer a esta pantalla |

La grilla es la pantalla **más difícil del producto hasta ahora**: una matriz de hasta 8 puestos por
8 chukkers, en un celular, al sol, con guantes. El plan tiene que resolver eso explícitamente y no
dar por hecho que una tabla sirve.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| **La matriz no se puede usar en un celular** y el comisario termina anotando en papel, como antes. | El diseño arranca por el celular, no por el escritorio: se recorre **por jugador** —una fila, sus chukkers— y no por celda suelta. Se prueba en un teléfono real antes de darlo por terminado, con el criterio de T-111. |
| **Los chukkers contados no cuadran** con lo que la gente recuerda, y se pierde la confianza en el número justo cuando empieza a costar plata. | El número **no se guarda en ninguna parte**: se cuenta de las celdas cada vez (R-052-02). No hay dos fuentes que puedan divergir. |
| **Cerrar demasiado pronto** deja la práctica congelada con datos a medias. | Reabrir existe, está a un toque y queda auditado. Es preferible a un candado que obligue a corregir por base de datos. |
| **La grilla nace en una transacción ajena** —la de aprobar equipos— y una falla al crearla tumba la aprobación. | Es deliberado (R-052-01) y es el comportamiento correcto: aprobar sin grilla deja una práctica que no se puede cerrar. Hay un test que aprueba con la creación de la grilla fallando y comprueba que **no quedan equipos aprobados**. |
| **Meter a alguien que no se postuló** abre la puerta a que se cuele cualquiera y después haya que cobrarle. | Es intencional (R-052-05) porque es lo que pasa en la cancha. Se acota a personas **activas del club**, y el cobro de quien jugó sin postularse es una decisión de Fase 3, declarada acá para que no la tome nadie en silencio. |

## 12. Definición de terminado

- [ ] Criterios de aceptación de cada HU cubiertos por un test con nombre legible en español
- [ ] Test de aislamiento de tenant en las seis rutas
- [ ] Test de autorización, con jugador **denegado** en cerrar, reabrir y editar la grilla
- [ ] Test de que la grilla nace **en la misma transacción** que la aprobación de equipos
- [ ] Test de que el `no_show` y tener celdas **no pueden coexistir**, en los dos sentidos
- [ ] Test de que reabrir deja rastro en `audit_log`
- [ ] `docs/02-domain-model.md` actualizado: se crean dos entidades y **se elimina `practice_attendance`**
- [ ] Demostrado en un teléfono real sobre staging (T-111)

## 13. Decisiones tomadas el 2026-08-26

| # | Pregunta | Decisión |
|---|---|---|
| D-052-01 | ¿Cómo se llena la grilla? | **Nace llena al aprobarse los equipos**; el comisario corrige excepciones |
| D-052-02 | ¿Grilla o asistencia? | **La grilla manda**; la asistencia se deriva y `practice_attendance` se elimina |
| D-052-03 | ¿Cuándo cierra? | **La cierra el comisario**, y puede reabrirla; la reapertura se audita |
| D-052-04 | ¿Consecuencias del no_show? | **Sólo se registra.** Penalizaciones y cobro son Fase 3 |

## 14. Supuestos

- `[SUPUESTO]` **Un chukker es una unidad indivisible**: se jugó o no se jugó, no hay medios
  chukkers. Es lo que asume `practice.chukkers` (6|7|8) desde `050` y nadie lo ha contradicho.
- `[SUPUESTO]` **Los dos equipos juegan los mismos chukkers.** No se modela que el equipo A juegue 6
  y el B juegue 5, porque no es polo.
