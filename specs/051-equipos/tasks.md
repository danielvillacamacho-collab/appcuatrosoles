# TASKS-051 — Equipos y balanceo

> Cada tarea: una sesión, un commit (`docs/10` §2).
> Si una tarea, al hacerla, resulta tocar más de 5 archivos o 400 líneas de diff: detente y avisa.

**Numeración `T-6XX`.**

El dominio va primero, como siempre, y esta vez con más razón que nunca: **el reparto es la promesa
del módulo**. Si «lo más parejo posible» no es literalmente cierto, todo lo demás —la pantalla, los
avisos, el registro— es andamiaje alrededor de un número equivocado.

## A — Dominio puro

- [ ] **T-601** `handicapDelPuesto`: el más alto de los dos cuando el puesto es compartido
  (R-051-06).
  Verificación: un puesto de una persona pesa lo suyo; uno compartido entre 2 y 4 goles pesa **4**,
  ni 6 ni 3; el orden de los dos no cambia el resultado; dos iguales pesan ese valor.

- [ ] **T-602** `balancearEquipos`: el reparto **exacto** más parejo (R-051-02, R-051-03, R-051-04).
  Verificación: con `[8,7,6,5,4]` el codicioso da diferencia 2 y el exacto da 0 — el test exige el
  exacto; el mismo conjunto **desordenado** da el mismo resultado; con número impar los equipos
  quedan con un puesto de diferencia; con cero y con un solo puesto no rompe; el peor caso del
  contrato —40 puestos de 20 medios— resuelve rápido.
  > El codicioso «el más fuerte al equipo más liviano» es fácil de escribir y **no siempre acierta**.
  > El caso de prueba está elegido para que se note la diferencia: sin él, el error pasaría.

## B — Datos

- [ ] **T-610** `PracticeTeam` y `PracticeSlot` (`plan.md` §1), con la migración.
  Verificación: `up`/`down`/`up` contra Postgres real; dos equipos con la misma etiqueta en una
  práctica se rechazan; dos puestos en la misma posición de un equipo se rechazan; **borrar el
  equipo se lleva sus puestos** y no deja huérfanos.
  > Revisar la migración por el `DROP DEFAULT` sobre `time_range` que Prisma vuelve a meter — es la
  > cuarta vez. Ver la cabecera de `20260811234305_handicaps`.

## C — API

- [ ] **T-620** `TeamsService`: proponer desde cero.
  Verificación: sólo sobre una práctica **confirmada** (R-051-01); rearmar dos veces no duplica
  equipos ni puestos; el handicap **queda congelado** en el puesto, y cambiarlo después en
  `specs/030` no mueve los equipos ya armados.

- [ ] **T-621** La propuesta **al confirmarse**, dentro de la transacción de la decisión
  (`plan.md` §5).
  Verificación: una práctica que se confirma queda con equipos propuestos sin que nadie haga nada;
  una que se cancela **no**; correr el proceso dos veces no arma equipos dos veces.

- [ ] **T-622** Ajustar y aprobar.
  Verificación: ajustar manda la **composición entera**; aprobar publica y avisa; **reacomodar
  después de aprobado se puede** y vuelve a avisar; un jugador que intenta aprobar recibe 403.

- [ ] **T-623** Quién ve qué (R-051-05).
  Verificación: un jugador **no ve** una propuesta sin aprobar — y **el test serializa la respuesta
  completa** buscando los nombres de los postulados, con el criterio de `specs/040` T-451: que el
  campo venga vacío no alcanza. Aprobados, sí los ve, con el suyo señalado.

- [ ] **T-624** Las rutas en el arnés de aislamiento.

## D — Interfaz

- [ ] **T-630** La pantalla del comisario: los dos equipos, **la diferencia en vivo**, y aprobar.
  > El asistente de balance no es una pantalla aparte: es el número al lado de cada equipo. Que
  > cambie al mover a alguien es la función entera.
  Verificación: mover un jugador actualiza las dos sumas y la diferencia **sin ir al servidor**; un
  puesto compartido muestra **los dos nombres**; un jugador no ve el botón de aprobar.

- [ ] **T-631** Los equipos en el detalle de la práctica, para el jugador.
  Verificación: sin aprobar no se muestra nada de equipos; aprobados, el equipo propio va señalado.

## E — Cierre

- [ ] **T-640** E2E: se confirma una práctica, el comisario mueve a alguien viendo cambiar la
  diferencia, aprueba, y un jugador ve su equipo.
  > Con día propio por corrida y un paso que lleva el estado a un punto conocido: la lección de los
  > E2E de `030` y `050`.
- [ ] **T-641** `verification.md` con cada criterio mapeado a su test.
