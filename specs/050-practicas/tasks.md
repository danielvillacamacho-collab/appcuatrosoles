# TASKS-050 — Prácticas oficiales

> Cada tarea: una sesión, un commit (`docs/10` §2).
> Si una tarea, al hacerla, resulta tocar más de 5 archivos o 400 líneas de diff: detente y avisa.

**Numeración `T-5XX`.**

**Éste es el módulo más grande hasta ahora**, y el orden de las secciones está pensado para que lo
difícil se decida temprano. El dominio va primero porque el reparto de cupos y la decisión son
reglas que no necesitan base de datos y sí necesitan que alguien piense los bordes. La sección E —el
proceso de decisión— es la más delicada, y llega cuando ya hay con qué probarla.

## A — Dominio puro

- [ ] **T-501** `armarPuestos`: agrupa postulaciones sueltas y parejas **recíprocas** en puestos
  (R-050-07, R-050-08).
  Verificación: dos postulaciones recíprocas son **un** puesto; una propuesta sin aceptar deja a los
  dos como puestos sueltos —o al proponente suelto y al otro sin postulación—; una propuesta a
  alguien que no se postuló no forma pareja; A propone a B y B propone a C **no** forma nada.
  > El caso del triángulo es el que se olvida y el que produce cupos fantasma.

- [ ] **T-502** `repartirCupos`: quién está dentro y quién en espera, por orden de llegada
  (R-050-06).
  Verificación: con 12 puestos y 8 cupos, entran los 8 primeros; el orden es por `applied_at` y
  **desempata por identificador**; retirar a uno de los de adentro promueve al primero de la espera
  **sin correr nada**; con menos puestos que cupos, todos entran y la espera va vacía.
  > **Dos postulaciones en el mismo milisegundo** tienen que dar siempre el mismo corte: si el orden
  > no es estable, la misma persona ve «dentro» y «en espera» en dos pantallazos seguidos.

- [ ] **T-503** `puedePostularse` (R-050-04, R-050-05).
  Verificación: un jugador fuera del rango sugerido **sí** puede; un estudiante habilitado hasta 4
  goles no puede en una de 6; el mismo estudiante sí puede en una de 4 —el borde es inclusivo—; una
  persona sin habilitación de estudiante no está limitada por ella.
  > El rango orienta y el tope del estudiante prohíbe. Son dos campos distintos justamente para que
  > no se confundan al leerlos.

- [ ] **T-504** `decidirPractica` y `estaAbiertaLaPostulacion`.
  Verificación: con puestos suficientes, `confirmar`; sin ellos, `cancelar`; antes de la hora,
  `todavia_no`; ya decidida, `ya_decidida`. La ventana de postulación con sus dos bordes exactos.
  > No escribe ni avisa: devuelve qué hay que hacer. Es lo que permite probar los cuatro casos sin
  > base de datos.

## B — Permisos

- [ ] **T-510** `practice.manage`, para el administrador del club **y** el comisario.
  Verificación: el test de conjunto exacto de `specs/030` **va a fallar**, y se actualiza escribiendo
  la decisión —`practice.manage` en las listas de `superadmin` y `club_admin`, y
  `commissioner/club → practice.manage` en `DEPORTIVOS`—. Un jugador es denegado.
  > A diferencia de `handicap.edit`, este permiso **sí** le corresponde al administrador. Que el
  > test falle igual es lo que se busca: obliga a escribir la decisión en vez de heredarla.

## C — Datos

- [ ] **T-520** `Practice`, `PracticeApplication` y `PracticeEligibility` (`plan.md` §1), con la
  migración y **el índice único parcial escrito a mano**.
  Verificación: `up`/`down`/`up` contra Postgres real; una segunda postulación vigente de la misma
  persona se rechaza; **quien se retiró puede volver a postularse**, que es lo que el índice parcial
  permite y uno total impediría.
  > Revisar la migración por el `DROP DEFAULT` sobre `time_range` que Prisma vuelve a meter y que
  > PostgreSQL rechaza con 42601. Ver la cabecera de `20260811234305_handicaps`.

- [ ] **T-521** `docs/02` con `practice_eligibility`, y `docs/08` con lo que este módulo lee.

## D — API

- [ ] **T-530** Crear y editar una práctica en borrador.
  Verificación: `min_players` mayor que `target_players` se rechaza; cierre posterior a decisión se
  rechaza (R-050-02); una práctica en borrador **no aparece** en el listado de nadie más.

- [ ] **T-531** Publicar: reserva la cancha **en la misma transacción** (R-050-01).
  Verificación: publicar sobre una franja ocupada se rechaza diciendo con qué choca **y la práctica
  sigue en borrador**; publicar dos veces no reserva dos veces; la práctica publicada aparece en el
  calendario de `specs/040`.

- [ ] **T-532** Cancelar: libera la cancha y avisa (R-050-12).
  Verificación: inmediatamente después de cancelar **se puede programar otra cosa en esa franja** —
  se comprueba programándola, no leyendo un campo.

- [ ] **T-533** Postularse y retirarse.
  Verificación: postularse dos veces se rechaza; después del cierre no se entra ni se sale
  (R-050-09); retirarse y volver a postularse deja a la persona **al final** de la fila; un
  estudiante no habilitado recibe 404 **pidiendo la práctica por su identificador**, no sólo
  ausencia en el listado.

- [ ] **T-534** El medio hombre: proponer y aceptar (R-050-08).
  Verificación: una propuesta sin aceptar **no ocupa puesto**; aceptada, los dos ocupan uno; si uno
  se retira, el otro queda suelto **en la misma posición de la fila**.

- [ ] **T-535** El listado y el detalle, con «dónde estoy yo».
  Verificación: la respuesta dice `dentro` o `en_espera` **con la posición**; dos personas distintas
  ven la misma práctica con su propio lugar; las rutas quedan en el arnés de aislamiento.

## E — La decisión automática

- [ ] **T-540** El proceso: la consulta de lo vencido, con la forma del `OutboxProcessor`
  (`plan.md` §0.2, §6).
  Verificación: una práctica con suficientes se confirma; sin suficientes se cancela **y libera la
  cancha**; una que todavía no vence no se toca.

- [ ] **T-541** **El sistema estuvo caído** (R-050-11).
  Verificación: con el reloj adelantado tres horas respecto de la hora de decisión, la práctica se
  decide igual. Es la prueba de que no hay nada programado que se pueda perder.

- [ ] **T-542** **No avisa dos veces** (R-050-10).
  Verificación: correr el proceso dos veces seguidas deja **un** aviso por persona. Se cuentan los
  mensajes encolados, no se confía en el estado.

- [ ] **T-543** La decisión y un retiro **simultáneos**.
  Verificación: el solape se **fuerza a mano**, no con `Promise.all` — la lección de `specs/030`
  T-332, donde ese atajo hacía pasar el test con y sin la garantía. Y se comprueba que el test falla
  sin el `FOR UPDATE`.

- [ ] **T-544** Los avisos `practice.confirmed` y `practice.cancelled`.
  Verificación: **se pueden silenciar** desde las preferencias. En `specs/010` un atajo hacía que
  todo aviso se considerara inevitable y las preferencias no se podían apagar; lo destapó un test de
  integración y éste es el que lo impide volver.

## F — Interfaz

- [ ] **T-550** Tablero de prácticas: sólo las que la persona puede ver.
- [ ] **T-551** Detalle con «estás dentro» o «estás en espera, en la posición N», y el botón de
  postularse o retirarse según corresponda.
  > Un tablero que sólo dice «postulado» deja a la gente sin saber si preparar los caballos, que es
  > el problema que este módulo viene a resolver.
- [ ] **T-552** Crear y publicar una práctica.

## G — Cierre

- [ ] **T-560** E2E de navegador: el administrador publica, dos jugadores se postulan, uno se
  retira, y el de la espera queda dentro.
  > Con motivo único por corrida y un paso que lleva el estado a un punto conocido: la lección del
  > E2E de `specs/030`.
- [ ] **T-561** `verification.md` con cada criterio mapeado a su test.
