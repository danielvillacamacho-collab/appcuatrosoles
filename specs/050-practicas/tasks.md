# TASKS-050 — Prácticas oficiales

> Cada tarea: una sesión, un commit (`docs/10` §2).
> Si una tarea, al hacerla, resulta tocar más de 5 archivos o 400 líneas de diff: detente y avisa.

**Numeración `T-5XX`.**

**Éste es el módulo más grande hasta ahora**, y el orden de las secciones está pensado para que lo
difícil se decida temprano. El dominio va primero porque el reparto de cupos y la decisión son
reglas que no necesitan base de datos y sí necesitan que alguien piense los bordes. La sección E —el
proceso de decisión— es la más delicada, y llega cuando ya hay con qué probarla.

## A — Dominio puro

- [x] **T-501** `armarPuestos`: agrupa postulaciones sueltas y parejas **recíprocas** en puestos
  (R-050-07, R-050-08).
  Verificación: dos postulaciones recíprocas son **un** puesto; una propuesta sin aceptar deja a los
  dos como puestos sueltos —o al proponente suelto y al otro sin postulación—; una propuesta a
  alguien que no se postuló no forma pareja; A propone a B y B propone a C **no** forma nada.
  > El caso del triángulo es el que se olvida y el que produce cupos fantasma.
  ✅ 2026-08-11 — 9 tests. **El titular de una pareja es quien llegó primero**, y la consecuencia
  vale la pena: el puesto se queda donde estaba y el compañero entra a ese mismo lugar. Nadie se
  corre, porque el número de puestos **no crece** al formarse una pareja — dos postulaciones sueltas
  que se emparejan pasan a ser una, así que la fila se acorta y alguien de la espera entra.
  > Con el criterio contrario —la posición del segundo— quien ofreció compartir perdería el lugar
  > que ya se había ganado, que es lo contrario de lo que conviene premiar.

- [x] **T-502** `repartirCupos`: quién está dentro y quién en espera, por orden de llegada
  (R-050-06).
  Verificación: con 12 puestos y 8 cupos, entran los 8 primeros; el orden es por `applied_at` y
  **desempata por identificador**; retirar a uno de los de adentro promueve al primero de la espera
  **sin correr nada**; con menos puestos que cupos, todos entran y la espera va vacía.
  > **Dos postulaciones en el mismo milisegundo** tienen que dar siempre el mismo corte: si el orden
  > no es estable, la misma persona ve «dentro» y «en espera» en dos pantallazos seguidos.
  ✅ 2026-08-11 — 11 tests, más `posicionDe` para responder «¿dónde quedé yo?». El desempate por
  identificador hacía falta **en dos lugares**, no en uno: al ordenar la fila y al armar la pareja.
  El segundo lo destapó la cobertura de ramas, que quedó en 97.77 % con una sola rama sin recorrer.

- [x] **T-503** `puedePostularse` (R-050-04, R-050-05).
  Verificación: un jugador fuera del rango sugerido **sí** puede; un estudiante habilitado hasta 4
  goles no puede en una de 6; el mismo estudiante sí puede en una de 4 —el borde es inclusivo—; una
  persona sin habilitación de estudiante no está limitada por ella.
  > El rango orienta y el tope del estudiante prohíbe. Son dos campos distintos justamente para que
  > no se confundan al leerlos.
  ✅ 2026-08-11 — 7 tests. **Falla cerrado**: si la persona tiene tope de estudiante y la práctica
  no declara su nivel, se rechaza. Es incómodo a propósito —obliga al club a declarar el nivel de
  las prácticas donde quiera estudiantes— y la alternativa es dejar entrar a un estudiante a algo
  que nadie verificó. Las dos razones de rechazo se distinguen para que la pantalla pueda decir
  cuál fue.

- [x] **T-504** `decidirPractica` y `estaAbiertaLaPostulacion`.
  Verificación: con puestos suficientes, `confirmar`; sin ellos, `cancelar`; antes de la hora,
  `todavia_no`; ya decidida, `ya_decidida`. La ventana de postulación con sus dos bordes exactos.
  > No escribe ni avisa: devuelve qué hay que hacer. Es lo que permite probar los cuatro casos sin
  > base de datos.
  ✅ 2026-08-11 — **cierra la sección A.** 14 tests, incluidos los dos que prueban R-050-11: tres
  horas tarde y una semana tarde, decide igual. Es la prueba de que no hay nada programado que se
  pueda perder — la decisión depende de que la hora haya pasado, no de que alguien la haya disparado
  en ese instante.

> **Sección A cerrada el 2026-08-11.** 41 tests, `packages/domain/src/practice` al 100 % de líneas
> y ramas. Ninguna de estas cuatro reglas toca la base de datos ni sabe de roles.

## B — Permisos

- [x] **T-510** `practice.manage`, para el administrador del club **y** el comisario.
  Verificación: el test de conjunto exacto de `specs/030` **va a fallar**, y se actualiza escribiendo
  la decisión —`practice.manage` en las listas de `superadmin` y `club_admin`, y
  `commissioner/club → practice.manage` en `DEPORTIVOS`—. Un jugador es denegado.
  > A diferencia de `handicap.edit`, este permiso **sí** le corresponde al administrador. Que el
  > test falle igual es lo que se busca: obliga a escribir la decisión en vez de heredarla.
  ✅ 2026-08-11 — **y la predicción volvió a ser falsa, por segunda vez y por otro motivo.** El test
  de conjunto exacto **no falló**: sus listas esperadas para `superadmin` y `club_admin` se
  calculaban con `PERMISSIONS.filter(...)`, así que el permiso nuevo entraba a la vez en lo esperado
  y en lo real. **El test que escribí en `specs/030` para atrapar justo esto seguía sin atraparlo.**
  > Sólo `organization_admin` —cuya lista sí estaba escrita a mano— habría avisado. Las tres quedaron
  > escritas a mano y completas: verboso a propósito, porque las filas administrativas se definen por
  > resta y la única forma de que agregar un permiso sea una decisión y no un descuido es que el test
  > no compile la respuesta solo.
  > Verificado agregando un permiso de mentira al catálogo: ahora sí falla, diciendo «los permisos de
  > superadmin cambiaron sin que nadie lo decidiera».
  > Lo que sí falló como estaba previsto fueron los dos tests del comisario, y se actualizaron con la
  > excepción explícita `commissioner/club → practice.manage`.

## C — Datos

- [x] **T-520** `Practice`, `PracticeApplication` y `PracticeEligibility` (`plan.md` §1), con la
  migración y **el índice único parcial escrito a mano**.
  Verificación: `up`/`down`/`up` contra Postgres real; una segunda postulación vigente de la misma
  persona se rechaza; **quien se retiró puede volver a postularse**, que es lo que el índice parcial
  permite y uno total impediría.
  > Revisar la migración por el `DROP DEFAULT` sobre `time_range` que Prisma vuelve a meter y que
  > PostgreSQL rechaza con 42601. Ver la cabecera de `20260811234305_handicaps`.
  ✅ 2026-08-11 — 10 tests contra la base. **La trajo otra vez**: es la tercera migración seguida.
  Queda escrito en la cabecera de ésta también.
  > El índice parcial se verificó **cambiándolo por uno total**: el test «quien se retiró puede
  > volver a postularse» falla. Sin él, retirarse sería irreversible, que no es lo que dice
  > HU-050-03.
  > La edición del esquema volvió a acotarse al bloque de cada modelo, comprobando que el ancla sea
  > única — la lección del esquema de handicaps, donde un ancla repetida en ocho modelos dejó siete
  > columnas de basura por tabla.

- [x] **T-521** `docs/02` con `practice_eligibility`, y `docs/08` con lo que este módulo lee.
  ✅ 2026-08-11 — **cierra las secciones B y C.** En `docs/08` quedó anotado algo que no estaba y
  vale para todo el catálogo: los valores de `practice.*` se leen **al crear** una práctica, para
  proponer los campos; una vez creada, la práctica guarda los suyos. Cambiar la configuración del
  club no altera lo ya publicado, porque la gente ya se postuló contando con esos números.

> **Secciones B y C cerradas el 2026-08-11.** 358 tests de dominio, 457 de integración.

## D — API

- [x] **T-530** Crear y editar una práctica en borrador.
  Verificación: `min_players` mayor que `target_players` se rechaza; cierre posterior a decisión se
  rechaza (R-050-02); una práctica en borrador **no aparece** en el listado de nadie más.
  ✅ 2026-08-11 — 32 tests en total para la sección. Las validaciones viven en el dominio
  (`validarParametrosDePractica`), no en el contrato: que `minPlayers` no supere a `targetPlayers`
  depende del otro campo y de lo que significan.
  > Se agregó una regla que **no estaba en el spec**: decidir después de que la práctica empezó no
  > describe ninguna situación real, y sin ella el club puede crear una práctica que nunca se decide
  > a tiempo sin que nada avise.

- [x] **T-531** Publicar: reserva la cancha **en la misma transacción** (R-050-01).
  Verificación: publicar sobre una franja ocupada se rechaza diciendo con qué choca **y la práctica
  sigue en borrador**; publicar dos veces no reserva dos veces; la práctica publicada aparece en el
  calendario de `specs/040`.
  ✅ 2026-08-11 — la reserva se crea con `BookingsService`, el mismo camino que todo lo demás. Un
  choque deshace la transacción entera y la práctica **sigue en borrador**, comprobado leyendo la
  fila después del rechazo.

- [x] **T-532** Cancelar: libera la cancha y avisa (R-050-12).
  Verificación: inmediatamente después de cancelar **se puede programar otra cosa en esa franja** —
  se comprueba programándola, no leyendo un campo.
  ✅ 2026-08-11 — hizo falta un `cancelarEn(tx, …)` en `BookingsService`: el que existía abría su
  propia transacción, y con dos transacciones separadas un fallo entre medio deja una práctica
  cancelada con la cancha ocupada.

- [x] **T-533** Postularse y retirarse.
  Verificación: postularse dos veces se rechaza; después del cierre no se entra ni se sale
  (R-050-09); retirarse y volver a postularse deja a la persona **al final** de la fila; un
  estudiante no habilitado recibe 404 **pidiendo la práctica por su identificador**, no sólo
  ausencia en el listado.
  ✅ 2026-08-11 — el estudiante recibe **404 y no 403** pidiendo la práctica por su identificador:
  decir «no podés ver ésta» ya revela que existe y de qué nivel es.
  > Un bug real: postularse dos veces daba **500** en vez de 409. El índice único parcial lo crea la
  > migración a mano, así que Prisma no lo conoce por nombre y su mensaje no lo menciona — buscar el
  > texto no servía. Se detecta por el **código** `P2002`.

- [x] **T-534** El medio hombre: proponer y aceptar (R-050-08).
  Verificación: una propuesta sin aceptar **no ocupa puesto**; aceptada, los dos ocupan uno; si uno
  se retira, el otro queda suelto **en la misma posición de la fila**.
  ✅ 2026-08-11 — aceptar una propuesta que nadie hizo se rechaza: sin esa comprobación, cualquiera
  podría emparejarse con quien quisiera con sólo escribir su identificador.

- [x] **T-535** El listado y el detalle, con «dónde estoy yo».
  Verificación: la respuesta dice `dentro` o `en_espera` **con la posición**; dos personas distintas
  ven la misma práctica con su propio lugar; las rutas quedan en el arnés de aislamiento.
  ✅ 2026-08-11 — **cierra la sección D.** Las nueve rutas declaradas, cada una con test propio.
  > **Dos horas perdidas en el andamiaje del test, y las dos por buenas razones.** Con una franja
  > fija, las prácticas de distintos tests chocaban al publicar y el síntoma aparecía tres tests más
  > adelante disfrazado de otra cosa. Y al separarlas, las horas nuevas caían **fuera del horario
  > del club**: se escriben en UTC y el horario se mide en la zona del club, así que las 08:00 UTC
  > son las 03:00 en Bogotá. Las dos quedaron explicadas en el archivo.

> **Sección D cerrada el 2026-08-11.** 513 tests de integración, `src/practices` al 85 %.

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
