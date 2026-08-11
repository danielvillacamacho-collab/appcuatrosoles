# SPEC-030 — Handicaps

> Estado: ready · Depende de: 010, 020 · Fuente: `docs/source` §5, `docs/02` §C, `docs/09` Q-11,
> decisiones de Daniel del 2026-08-11 (§13)

Segundo módulo de la Fase 2. Es el más pequeño de los tres y el que más cosas sostiene: **el
balanceo de equipos de 050, las bandas de handicap de las copas de 060 y las ventajas de gol de
060 se calculan todos a partir de este número.** Si el número no es confiable, nada de lo que
venga después lo es.

También es el primer módulo que es casi enteramente dominio puro: aquí no hay concurrencia, ni
rangos de tiempo, ni una restricción de base de datos que haga el trabajo difícil. Lo que hay es
una regla de autoridad muy estrecha, una unidad de medida que se presta a errores de redondeo, y
un historial del que depende que nadie discuta.

## 1. Problema

El handicap es la calificación de nivel de cada jugador: va de −2 (principiante) a 10 (los mejores
del mundo), y el handicap de un equipo es la suma de los de sus jugadores. Hoy en el club ese
número vive en la cabeza del comisario y en mensajes sueltos. Las consecuencias son concretas:

- **«¿Con cuánto está jugando Juan?»** no tiene una respuesta que todos vean igual. Dos personas
  arman equipos con dos números distintos y el partido queda desparejo.
- **«A mí me subieron y nadie me dijo.»** Un cambio de handicap afecta a qué prácticas califica un
  jugador y en qué copas puede inscribirse, y hoy no queda rastro de cuándo cambió ni por qué.
- **Nadie puede reconstruir la evolución de un jugador.** El comité que decide handicaps no tiene
  con qué respaldar una decisión, más allá de la memoria de quien estuvo.

Y hay un problema de autoridad: en el polo, el handicap lo fija **el comisario y nadie más**. Un
sistema donde el administrador del club puede tocarlo —aunque sea por comodidad— rompe la línea de
autoridad deportiva que el club sí respeta en la cancha.

## 2. Resultado esperado

Cada persona del club tiene dos handicaps —el internacional y el del club— visibles para todo el
club, editables **únicamente por el comisario**, y con un historial completo de cada cambio: valor
anterior, valor nuevo, quién lo hizo, cuándo y por qué.

El valor vigente y el historial **no pueden divergir**: el vigente siempre es el último cambio
registrado, garantizado por construcción y no por disciplina.

## 3. Fuera de alcance (en esta versión)

- **La delegación en un subcomisario** (`docs/09` Q-11). Decidido el 2026-08-11: va en su propio
  spec. La delegación alcanza tres cosas —editar handicaps, aprobar equipos y validar
  resultados— y hoy sólo existe la primera. Diseñarla ahora la dejaría hecha a medias, con una
  forma decidida por el único caso que existe.
- **Elegir qué handicap aplica en cada evento.** El documento es claro en que se decide evento por
  evento, pero esa decisión vive en la práctica (050) y en la copa (060), no aquí. Este módulo
  provee los dos números; quién elige cuál se usa es de quien crea el evento.
- **El balanceo de equipos y las ventajas de gol.** Son 050 y 060. Consumen este módulo.
- **El congelado de handicaps al arrancar una copa** (`docs/02` §E, «snapshot obligatorio»). La
  copa guarda su propia foto; este módulo no sabe de copas. Es justamente lo que permite que aquí
  el cambio rija de inmediato (R-030-06).
- **Handicap de caballos, de coaches o por posición.** No existen en el polo tal como lo juega el
  club.
- **Un flujo de propuesta y aprobación** (que un profesor sugiera y el comisario apruebe). El
  documento describe al comité como algo que ocurre fuera de la plataforma: «detrás puede haber un
  comité que decida, pero en la plataforma la única mano autorizada es la del comisario».

## 4. Actores

| Actor | Qué hace aquí |
|---|---|
| `commissioner` | **el único** que fija handicaps, de cualquier persona de su club |
| `club_admin` | ve los handicaps y el historial; **no puede editarlos** (R-030-02) |
| Cualquiera con sesión | ve el handicap vigente de cualquier persona del club |
| El propio jugador (o su acudiente) | ve además su propio historial completo |

## 5. Historias de usuario

### HU-030-01 — El comisario fija el handicap de un jugador
**Como** comisario **quiero** fijar el handicap internacional o de club de una persona **para** que
todo el club juegue con el mismo número.

- **Dado** un jugador con handicap de club en 2, **cuando** el comisario lo fija en 2.5 con el
  motivo «buen semestre, sube medio gol», **entonces** el valor vigente pasa a 2.5 y el cambio
  queda en el historial con el valor anterior, el nuevo, quién y cuándo.
- **Dado** un jugador, **cuando** el comisario intenta fijarlo en 1.3, **entonces** se rechaza: el
  handicap se mueve en medios goles, no en decimales arbitrarios (R-030-03).
- **Dado** un jugador, **cuando** el comisario intenta fijarlo en 12, **entonces** se rechaza por
  estar fuera del rango del polo (R-030-04).
- **Dado** un jugador con handicap de club en 2, **cuando** el comisario lo «cambia» a 2,
  **entonces** se rechaza: no hay cambio que registrar, y un historial lleno de filas idénticas
  vuelve inútil lo único que este módulo promete (R-030-08).
- **Dado** cualquier cambio, **cuando** el comisario no escribe un motivo, **entonces** se rechaza
  (R-030-07).

### HU-030-02 — Sólo el comisario
**Como** club **quiero** que la autoridad sobre los handicaps sea de una sola mano **para** que la
línea de autoridad deportiva sea la misma dentro y fuera de la plataforma.

- **Dado** un administrador del club, **cuando** intenta fijar un handicap, **entonces** se rechaza
  aunque pueda hacer todo lo demás en el club (R-030-02).
- **Dado** el comisario de otro club, **cuando** intenta fijar el handicap de una persona de este
  club, **entonces** responde 404 — nunca 403, que confirmaría que la persona existe
  (`docs/06`, P-05).
- **Dado** un jugador, **cuando** intenta cambiar su propio handicap, **entonces** se rechaza.

### HU-030-03 — Ver con cuánto juega cada quien
**Como** jugador **quiero** ver el handicap de las personas del club **para** entender cómo quedó
armado un equipo.

- **Dado** cualquier persona con sesión, **cuando** consulta el handicap de otra persona del club,
  **entonces** ve los dos valores vigentes.
- **Dado** cualquier persona con sesión, **cuando** consulta el historial de **otra** persona,
  **entonces** se rechaza: el motivo de un cambio puede ser delicado (R-030-09).
- **Dado** un jugador, **cuando** consulta su **propio** historial, **entonces** lo ve completo, con
  motivos y autores.
- **Dado** un acudiente, **cuando** consulta el historial de un menor a su cargo, **entonces** lo ve
  completo — es quien responde por ese perfil (`specs/010`).

### HU-030-04 — La evolución de un jugador
**Como** comisario **quiero** ver el historial completo de handicaps de una persona **para**
respaldar una decisión del comité y zanjar discusiones sobre con cuánto estaba jugando.

- **Dado** un jugador con tres cambios registrados, **cuando** el comisario consulta su historial,
  **entonces** los ve del más reciente al más antiguo, cada uno con valor anterior, nuevo, autor,
  fecha, motivo y la temporada en que ocurrió.
- **Dado** un jugador al que nadie ha calificado nunca, **cuando** se consulta su historial,
  **entonces** viene vacío — y eso es dato, no ausencia de dato (R-030-05).

## 6. Reglas de negocio

- `R-030-01` **Cada persona tiene dos handicaps**, internacional y de club, independientes entre sí.
  Ninguno se deriva del otro.
- `R-030-02` **Sólo el comisario los edita.** No el administrador del club, no el administrador de
  organización, no el superadministrador de la plataforma. Es la única regla de este módulo que va
  contra la forma en que están escritos los demás permisos, y es a propósito (ver §11).
- `R-030-03` **El handicap se persiste en medios goles enteros** (`handicap_halves`). 1.5 goles se
  guarda como `3`. Ningún decimal toca la base de datos ni el dominio (constitución, regla 4).
- `R-030-04` **Rango válido: −4 a 20 medios goles** (−2 a 10 goles). Fuera de eso se rechaza.
- `R-030-05` **Toda persona nace con handicap −2 en ambos tipos** (`−4` medios). Decidido el
  2026-08-11. Como consecuencia, «nunca calificado» y «calificado en −2» tienen el mismo valor
  vigente; **lo que los distingue es el historial**: quien no tiene ninguna fila nunca fue
  evaluado. Cualquier consumidor que necesite la diferencia —el balanceo de 050— la pregunta ahí,
  no al valor.
- `R-030-06` **El cambio rige de inmediato.** No hay fechas de vigencia futuras. Las copas en curso
  están protegidas por su propio congelado (`docs/02` §E), no por este módulo.
- `R-030-07` **Todo cambio lleva motivo**, obligatorio y no vacío. `[SUPUESTO]` — el documento
  fuente no lo exige explícitamente, pero el propósito declarado del historial es respaldar
  decisiones y evitar discusiones, y un historial de cambios sin motivos no respalda nada. Mismo
  criterio que el motivo obligatorio del bloqueo de cancha (`specs/040` R-040-08).
- `R-030-08` **Un cambio que no cambia nada se rechaza.** Fijar el mismo valor que ya rige no es una
  operación válida.
- `R-030-09` **El vigente es público dentro del club; el historial es restringido.** Lo ven el
  comisario, los administradores del club, la propia persona y su acudiente. Decidido el
  2026-08-11.
- `R-030-10` **El historial es la fuente de verdad y es append-only** (constitución, regla 7). El
  valor vigente es una denormalización para consultar rápido. **Si divergen, gana el historial.**
- `R-030-11` **El valor vigente y el último registro del historial siempre coinciden**
  (`docs/02` §Invariantes, regla 6). No es una aspiración: se escribe en la misma transacción y hay
  una comprobación que lo verifica contra la base.
- `R-030-12` **Cada cambio registra la temporada vigente** al momento de ocurrir, para poder agrupar
  la evolución por período. Si el club no tiene temporada abierta, el cambio se registra igual, sin
  temporada — la falta de una temporada no puede bloquear una decisión deportiva.
- `R-030-13` **El handicap pertenece a la persona, no a la cuenta de acceso.** Un menor sin login
  tiene handicap propio (`docs/source` §3).

## 7. Datos

De `docs/02` §C, ya previstas y sin cambios de forma:

- **`player_handicap`** — el valor vigente denormalizado, por persona y tipo.
- **`handicap_history`** — append-only, con valor anterior, nuevo, autor, motivo, temporada y
  cuándo.

Dos precisiones que este spec fija y que hay que reflejar en `docs/02` al aceptarlo:

1. Ambas tablas llevan `club_id` (constitución, regla 6), aunque se pueda llegar a él por la
   persona: el filtro de tenant se aplica en el repositorio y no puede depender de un join.
2. `handicap_history.on_behalf_of_id` queda **previsto y sin usar** hasta que exista la delegación
   en un subcomisario. Se documenta como tal en vez de borrarse, porque la columna es exactamente
   la que esa delegación va a necesitar.

## 8. Interfaz

```
GET    /people/:id/handicaps                sesión              → los dos valores vigentes
GET    /people/:id/handicaps/history        restringido R-030-09 → el historial, del más nuevo al más viejo
PUT    /people/:id/handicaps/:type          handicap.edit       { valueHalves, reason }
GET    /handicaps?type=club                 sesión              → el vigente de todo el club, paginado
```

El listado del club existe porque el balanceo de equipos de 050 lo va a necesitar para todos los
postulados a la vez, y pedir uno por uno sería el problema de las N+1 consultas trasladado a la
red. Se pagina con el mismo criterio que `GET /users` (`specs/010` T-078).

`PUT` y no `PATCH`: fijar un handicap es reemplazar un valor por otro completo, no modificar parte
de un recurso.

## 9. Dominio puro

```ts
/** −2 goles ↔ −4 medios. La única conversión válida; nadie multiplica por dos a mano. */
function goalsToHalves(goals: number): Result<HandicapHalves, HandicapInvalido>
function halvesToGoals(halves: HandicapHalves): number

/** Rango y granularidad juntos: entero, entre −4 y 20. */
function validarHandicap(halves: number): Result<HandicapHalves, HandicapInvalido>

/**
 * La regla completa de un cambio: rango, granularidad, motivo y que de verdad cambie algo.
 * No sabe quién lo pide — la autoridad es `hasPermission`, y son dos preguntas distintas.
 */
function planearCambioDeHandicap(
  actual: HandicapHalves,
  propuesto: number,
  motivo: string,
): Result<CambioDeHandicap, RechazoDeCambio>

/** La suma de un equipo, en medios goles. La usa 050; vive aquí porque es aritmética de handicap. */
function handicapDelEquipo(jugadores: readonly HandicapHalves[]): HandicapHalves
```

`RechazoDeCambio` es una unión discriminada con las razones —`fuera_de_rango`, `no_es_medio_gol`,
`sin_motivo`, `sin_cambio`— para que la interfaz explique cuál falló y no un «handicap inválido»
que no le dice nada al comisario.

**La conversión a texto no vive en el dominio.** `1.5` se escribe «1,5» en es-CO, y eso es
presentación (constitución, regla 1).

## 10. Pantallas

| Pantalla | Qué decisión permite tomar |
|---|---|
| El handicap en el perfil de una persona | ver con cuánto juega, y —si corresponde— entrar al historial |
| Fijar handicap (sólo comisario) | subir o bajar a alguien, con el motivo escrito |
| Historial de handicap | reconstruir la evolución de un jugador para respaldar una decisión |

La pantalla de fijar handicap **no existe para quien no es comisario**: ofrecer un botón que el API
va a rechazar es mentir (mismo criterio que el bloqueo de cancha en `specs/040`).

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| **`club_admin` recibe `handicap.edit` sin que nadie lo decida.** Hoy sus permisos se calculan como «todos menos `platform.club.manage`», así que **un permiso nuevo le llega solo**. Es la primera vez que un permiso tiene que quedar explícitamente fuera. | La lista de excepciones se vuelve explícita y con nombre, y hay un test que recorre roles × permisos y falla si `club_admin` gana `handicap.edit`. El test que ya existe detectó el cambio del comisario en `specs/040`; éste es el mismo mecanismo. |
| **El vigente y el historial divergen** por un camino de escritura que se salte uno de los dos. | Un único servicio escribe, y escribe los dos en la misma transacción. Un test comprueba contra la base que después de N cambios el vigente coincide con el último registro. |
| **Aritmética de medios goles mal hecha** — un redondeo, un `/2` en el lugar equivocado, y un jugador de 2.5 pasa a 2 en silencio. | La conversión existe en un solo lugar y es la única forma de construir el tipo. El dominio nunca ve decimales. |
| **La misma persona en dos clubes tiene dos handicaps internacionales que pueden divergir.** El internacional es global por naturaleza, pero `person` es por club. | Se acepta y se declara: hoy no hay identidad de persona entre clubes, y crearla es un problema mayor que éste (`docs/09`). El internacional se trata como «el internacional según este club». |
| **Nadie califica a nadie** y todos quedan en −2, que es un handicap real: los equipos se arman como si todos fueran principiantes. | El historial vacío es la señal. 050 la consulta al balancear y avisa antes de armar equipos con gente sin calificar. |

## 12. Definición de terminado

- [ ] Criterios de aceptación de cada HU cubiertos por un test con nombre legible en español
- [ ] Test de aislamiento de tenant en las cuatro rutas
- [ ] Test de autorización en cada endpoint, con `club_admin` **denegado** en la edición
- [ ] Test que comprueba contra la base que vigente e historial no divergen
- [ ] `docs/02-domain-model.md` actualizado con las dos precisiones de §7
- [ ] `docs/09-open-questions.md` con las cuatro decisiones del 2026-08-11

## 13. Decisiones tomadas el 2026-08-11

| # | Pregunta | Decisión |
|---|---|---|
| D-030-01 | ¿El cambio puede programarse con fecha futura? | **No: rige de inmediato.** Las copas ya se protegen con su propio congelado |
| D-030-02 | ¿Qué handicap tiene quien no ha sido calificado? | **−2, como cualquiera.** La diferencia la marca el historial vacío |
| D-030-03 | ¿La delegación en subcomisario entra aquí? | **No: spec propio**, cuando exista más de una cosa que delegar |
| D-030-04 | ¿Quién ve el historial? | **El vigente es público en el club; el historial**, sólo comisario, administradores, la persona y su acudiente |
