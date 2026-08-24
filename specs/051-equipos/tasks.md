# TASKS-051 — Equipos y balanceo

> Cada tarea: una sesión, un commit (`docs/10` §2).
> Si una tarea, al hacerla, resulta tocar más de 5 archivos o 400 líneas de diff: detente y avisa.

**Numeración `T-6XX`.**

El dominio va primero, como siempre, y esta vez con más razón que nunca: **el reparto es la promesa
del módulo**. Si «lo más parejo posible» no es literalmente cierto, todo lo demás —la pantalla, los
avisos, el registro— es andamiaje alrededor de un número equivocado.

## A — Dominio puro

- [x] **T-601** `handicapDelPuesto`: el más alto de los dos cuando el puesto es compartido
  (R-051-06).
  Verificación: un puesto de una persona pesa lo suyo; uno compartido entre 2 y 4 goles pesa **4**,
  ni 6 ni 3; el orden de los dos no cambia el resultado; dos iguales pesan ese valor.
  ✅ 2026-08-24 — 5 tests, incluido el de handicaps negativos. Sumarlos inventaría un puesto que no
  existe; promediarlos castigaría al bueno por acompañar a alguien.

- [x] **T-602** `balancearEquipos`: el reparto **exacto** más parejo (R-051-02, R-051-03, R-051-04).
  Verificación: con `[8,7,6,5,4]` el codicioso da diferencia 2 y el exacto da 0 — el test exige el
  exacto; el mismo conjunto **desordenado** da el mismo resultado; con número impar los equipos
  quedan con un puesto de diferencia; con cero y con un solo puesto no rompe; el peor caso del
  contrato —40 puestos de 20 medios— resuelve rápido.
  > El codicioso «el más fuerte al equipo más liviano» es fácil de escribir y **no siempre acierta**.
  > El caso de prueba está elegido para que se note la diferencia: sin él, el error pasaría.
  ✅ 2026-08-24 — 13 tests. **Cierra la sección A.** Reparto exacto con programación dinámica sobre
  «cuántos van en A y cuánto suman»: 40 puestos —el máximo del contrato— se reparten en menos de un
  segundo, así que no hay camino aproximado ni dos comportamientos que explicar.
  > **Dos errores míos los encontraron los tests de borde, no yo.** El de handicaps negativos:
  > la tabla se indexa por suma y no admite índices negativos, así que se trabaja con la suma
  > desplazada — y yo había escrito el objetivo dividiendo también el desplazamiento, que da el
  > valor equivocado en cuanto hay un principiante. Un club con principiantes es el caso normal,
  > no el raro.
  > Y el del puesto único: la búsqueda arrancaba en la suma cero dándola por buena, y cero no es
  > alcanzable para un grupo de uno. El reparto salía vacío.

> **Sección A cerrada el 2026-08-24.** 18 tests, `packages/domain/src/practice` al 100 % de líneas.

## B — Datos

- [x] **T-610** `PracticeTeam` y `PracticeSlot` (`plan.md` §1), con la migración.
  Verificación: `up`/`down`/`up` contra Postgres real; dos equipos con la misma etiqueta en una
  práctica se rechazan; dos puestos en la misma posición de un equipo se rechazan; **borrar el
  equipo se lleva sus puestos** y no deja huérfanos.
  > Revisar la migración por el `DROP DEFAULT` sobre `time_range` que Prisma vuelve a meter — es la
  > cuarta vez. Ver la cabecera de `20260811234305_handicaps`.
  ✅ 2026-08-24 — 6 tests. **La trajo, otra vez.** Cuarta migración seguida.
  > Y hay un test que comprueba la promesa de T-007 con tablas de verdad: las dos nacieron
  > accesibles para el rol de aplicación **sin que nadie otorgara nada**. Si los privilegios por
  > defecto no funcionaran, este archivo entero fallaría con «permission denied», porque la suite
  > corre como `polo_app` y no como el dueño.
  > Los tests empezaron compartiendo una práctica y chocaban entre ellos por la restricción de «un
  > equipo A por práctica»: el síntoma aparecía en un test que no tenía nada que ver. Cada uno crea
  > la suya.

> **Sección B cerrada el 2026-08-24.** 518 tests de integración.

## C — API

- [x] **T-620** `TeamsService`: proponer desde cero.
  Verificación: sólo sobre una práctica **confirmada** (R-051-01); rearmar dos veces no duplica
  equipos ni puestos; el handicap **queda congelado** en el puesto, y cambiarlo después en
  `specs/030` no mueve los equipos ya armados.
  ✅ 2026-08-24 — 14 tests para la sección, **todos verdes a la primera**. Rearmar borra los dos
  equipos y los vuelve a crear: los puestos se van con ellos por el `Cascade`, así que no quedan
  huérfanos.
  > Ajustar **no recalcula el handicap de nadie**: mover a alguien de equipo no cambia cuánto pesa.
  > Recalcularlo ahí haría que un cambio de handicap ocurrido en el medio se colara sin que nadie lo
  > pidiera.

- [x] **T-621** La propuesta **al confirmarse**, dentro de la transacción de la decisión
  (`plan.md` §5).
  Verificación: una práctica que se confirma queda con equipos propuestos sin que nadie haga nada;
  una que se cancela **no**; correr el proceso dos veces no arma equipos dos veces.
  ✅ 2026-08-24 — la propuesta va **dentro de la transacción** en que se confirma. Con dos
  transacciones separadas, un proceso que muere entre una y otra deja una práctica confirmada sin
  equipos, y la promesa de HU-051-01 dependería de que nadie se caiga.

- [x] **T-622** Ajustar y aprobar.
  Verificación: ajustar manda la **composición entera**; aprobar publica y avisa; **reacomodar
  después de aprobado se puede** y vuelve a avisar; un jugador que intenta aprobar recibe 403.
  ✅ 2026-08-24 — y un ajuste que deja gente afuera se rechaza: sin esa comprobación alguien podría
  desaparecer de los dos equipos y nadie se enteraría hasta la cancha.

- [x] **T-623** Quién ve qué (R-051-05).
  Verificación: un jugador **no ve** una propuesta sin aprobar — y **el test serializa la respuesta
  completa** buscando los nombres de los postulados, con el criterio de `specs/040` T-451: que el
  campo venga vacío no alcanza. Aprobados, sí los ve, con el suyo señalado.
  ✅ 2026-08-24 — **404 y no 403** ante un borrador: decir «hay equipos pero no podés verlos» ya
  cuenta que existen, y lo que se quiere es que un borrador no exista para nadie más.

- [x] **T-624** Las rutas en el arnés de aislamiento.
  ✅ 2026-08-24 — **cierra la sección C.** Las cuatro con test propio: las tres que escriben dependen
  del estado, y la de lectura se acota además por si quien mira puede aprobar.
  > **Ningún permiso nuevo.** `practice.manage` alcanzó, y que este módulo no haya tenido que tocar
  > la tabla de permisos es la señal de que ese permiso estaba bien pensado.

> **Sección C cerrada el 2026-08-24.** 538 tests de integración.

## D — Interfaz

- [x] **T-630** La pantalla del comisario: los dos equipos, **la diferencia en vivo**, y aprobar.
  > El asistente de balance no es una pantalla aparte: es el número al lado de cada equipo. Que
  > cambie al mover a alguien es la función entera.
  Verificación: mover un jugador actualiza las dos sumas y la diferencia **sin ir al servidor**; un
  puesto compartido muestra **los dos nombres**; un jugador no ve el botón de aprobar.
  ✅ 2026-08-24 — 15 tests. Verificado además en el navegador contra el API real: mover a un jugador
  cambió la diferencia de «Parejos» a 6 goles **con cero llamadas al API**.
  > **Y ahí aparecieron dos cosas que ningún test veía.**
  > La primera: una práctica confirmada **sin equipos** dejaba al comisario en un callejón — el API
  > podía armarlos y la pantalla no ofrecía cómo. Es el mismo agujero de `specs/030` con la pantalla
  > de handicaps y de `specs/050` con aceptar un medio hombre: faltaba el camino, no la
  > funcionalidad. Tres veces el mismo hallazgo, y las tres lo destapó abrir la pantalla.
  > La segunda: **guardar un ajuste no persistía**. Reasignar posiciones de a una fila pasa por
  > estados que violan el índice único `(equipo, posición)`: si el primer puesto de A se va, el
  > segundo pasa a la posición 1 **mientras el primero todavía está ahí**. La transacción fallaba
  > con un 500. Se reprodujo primero en un test —falló con 500— y recién después se arregló, en dos
  > pasadas: primero todo a posiciones negativas con su equipo definitivo, después las de verdad.

- [x] **T-631** Los equipos en el detalle de la práctica, para el jugador.
  Verificación: sin aprobar no se muestra nada de equipos; aprobados, el equipo propio va señalado.
  ✅ 2026-08-24 — **cierra la sección D.** Un borrador no se esconde en la pantalla: el API le
  responde 404 a quien no puede aprobarlo, así que acá no hay nada que ocultar.
  > La ruta de detalle pasó a ser `$practiceId.index.tsx`: como `$practiceId.tsx` actuaba de
  > plantilla y no rendía el hijo, la pantalla de equipos no aparecía nunca.

> **Sección D cerrada el 2026-08-24.** 167 tests de interfaz, bundle 125.2 de 200 KB.

## E — Cierre

- [ ] **T-640** E2E: se confirma una práctica, el comisario mueve a alguien viendo cambiar la
  diferencia, aprueba, y un jugador ve su equipo.
  > Con día propio por corrida y un paso que lleva el estado a un punto conocido: la lección de los
  > E2E de `030` y `050`.
- [ ] **T-641** `verification.md` con cada criterio mapeado a su test.
