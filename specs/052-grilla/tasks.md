# TASKS-052 — Grilla de chukkers, asistencia y resultado

> Cada tarea: una sesión, un commit (`docs/10` §2).
> Si una tarea, al hacerla, resulta tocar más de 5 archivos o 400 líneas de diff: detente y avisa.

**Numeración `T-7XX`.**

El dominio va primero, como siempre. Acá la promesa del módulo es más humilde que la de `051` —no
decide nada— pero es la que va a costar plata si falla: **el número de chukkers de una persona**. Ese
número lo va a leer el cobro de Fase 3, y si sale mal se cobra mal.

## A — Dominio puro

- [x] **T-701** `grillaInicial`: cada puesto en todos los chukkers (R-052-01).
  Verificación: 8 puestos × 6 chukkers da 48 celdas y ninguna repetida; un puesto de medio hombre
  queda a nombre del **titular** (R-052-08); con 7 y con 8 chukkers sale lo que debe; con cero
  puestos devuelve vacío en vez de romper.
  ✅ 2026-08-26 — 5 tests. Las celdas de un puesto compartido nacen **todas a nombre del titular**:
  repartirlas por la mitad sería inventar un dato con apariencia de hecho, y quién de los dos entró
  en cada chukker es justamente lo que el comisario va a corregir.

- [x] **T-702** `chukkersPorPersona`: la cuenta, contada de las celdas y de ningún otro lado
  (R-052-02).
  Verificación: quien está en 6 celdas cuenta 6; las celdas vacías **no cuentan para nadie**; un
  puesto compartido reparte según quién esté en cada celda, no mitad y mitad; alguien que no está en
  ninguna celda **no aparece en el resultado**, que es distinto de aparecer en cero.
  > La distinción del último criterio es la que separa «no jugó» de «no estaba», y es justo la que
  > el cobro va a necesitar.
  ✅ 2026-08-26 — 6 tests. La distinción entre «no jugó» y «no estaba» quedó como test propio: quien
  no tiene celdas **no aparece en el mapa**, en vez de aparecer en cero. Un cero inventado las
  confunde, y el cobro de Fase 3 va a necesitar separarlas.

- [x] **T-703** `validarGrilla`: nadie dos veces en el mismo chukker (R-052-04).
  Verificación: la misma persona en dos celdas del mismo chukker se rechaza, **aunque sea en equipos
  distintos**; la misma persona en chukkers distintos se acepta; dos celdas vacías en el mismo
  chukker se aceptan; el error dice **quién** y **en qué chukker**, porque un rechazo que no lo diga
  obliga a buscar a mano en una matriz de 64 celdas.
  ✅ 2026-08-26 — 7 tests. La comprobación es **entre los dos equipos, no dentro de cada uno**: la
  misma persona en A y en B en el mismo chukker es el caso que de verdad ocurre —sustituir a alguien
  y olvidar sacarlo de donde estaba— y es el que se escapa mirando equipo por equipo.

- [x] **T-704** `puedeCerrar`: contra el reloj inyectado (R-052-07).
  Verificación: una práctica confirmada que ya empezó se puede cerrar; una que empieza en una hora
  **no**; una cancelada no; una ya cerrada no; y **ningún `new Date()`** — el test fija el reloj y
  mueve la hora, no el sistema (P-08).
  ✅ 2026-08-26 — 8 tests, incluido el borde exacto del instante de comienzo. **Cierra la sección A.**
  El último test es la comprobación de P-08: la misma práctica da distinto según la hora que se le
  pase. Si el dominio mirara `new Date()`, ese test no se podría escribir.

> **Sección A cerrada el 2026-08-26.** 23 tests, `grid.ts` al 100 % de líneas, ramas y funciones.
> Las cuatro funciones se verificaron **rompiéndolas a propósito**: mirar el chukker equipo por
> equipo, contar los huecos como si fueran gente, leer el reloj del sistema en vez del inyectado, y
> repartir el puesto compartido. Las cuatro mutaciones hacen fallar tests (2, 1, 3 y 4
> respectivamente). Un test que pasa igual con y sin la garantía que dice probar es peor que no
> tenerlo.

## B — Datos

- [x] **T-711** Esquema: `ChukkerGridCell` y `PracticeResult`, el estado `played`, y `closedAt` /
  `closedById` en `Practice`. Migración revisada **a mano** antes de aplicarla.
  Verificación: la migración aplica y revierte contra Postgres real; el `UNIQUE` de
  `(practice_id, chukker_no, person_id)` **rechaza** a la misma persona dos veces y **acepta** dos
  huecos; el comentario del enum que prometía `played` para `051` queda corregido en la misma
  migración.
  > Prisma tiene antecedentes en este repo (`030`: `DROP DEFAULT` sobre una columna GENERATED, que
  > PostgreSQL rechaza con 42601). El SQL se lee antes de aplicarlo, siempre.
  ✅ 2026-08-26 — 9 tests de esquema. **Prisma volvió a generar el `DROP DEFAULT` sobre la columna
  GENERATED de `field_booking`**, por quinta vez en este repo; se quitó a mano y quedó advertido en
  la cabecera de la migración. El `down.sql` fue la parte que no era trivial: PostgreSQL no tiene
  `DROP VALUE` para un enum, así que quitar `played` obliga a recrear el tipo y a reescribir la
  columna. El ciclo **up → down → up** se probó contra Postgres real, que es lo que corre CI.
  > Comprobado además que el `ALTER DEFAULT PRIVILEGES` de `020` T-007 alcanza a las tablas nuevas:
  > `polo_app` quedó con permisos sin que esta migración se los diera. Si no fuera así, la suite de
  > integración —que corre con el rol restringido— habría fallado entera tres tareas más adelante.

- [x] **T-712** La celda **no** cuelga del equipo: comprobar que un rearme no se lleva la grilla.
  Verificación: se aprueba, se corrige la grilla a mano, se vuelve a proponer equipos y se aprueba
  otra vez; **las correcciones siguen ahí**. Es el test que justifica que `team` sea una coordenada
  y no una llave foránea (plan §5).
  ✅ 2026-08-26 — el test borra el equipo y cuenta las celdas: siguen las 6. Es la garantía de que
  `team` sea una coordenada y no una llave foránea. Con la llave, el primer comisario que rearmara
  equipos se habría llevado la grilla por cascada, en silencio y sin un error que lo delatara.

> **Sección B cerrada el 2026-08-26.** 550 tests de integración (541 + 9). El `UNIQUE` de
> `(practice_id, chukker_no, person_id)` se comprobó contra Postgres **antes** de escribirlo y otra
> vez contra la tabla real: acepta varios huecos en el mismo chukker —los nulos no chocan entre sí—
> y rechaza a la misma persona dos veces, **también entre equipos distintos**, que es el caso que un
> índice por equipo dejaría pasar.

## C — API

- [x] **T-721** La grilla nace al aprobar, **en la misma transacción** que la aprobación
  (R-052-01).
  Verificación: aprobar deja 48 celdas; **si crear la grilla falla, no quedan equipos aprobados**;
  aprobar por segunda vez **no** recrea la grilla ni pisa lo corregido.
  ✅ 2026-08-27 — 3 tests. La grilla se crea dentro de la transacción de `aprobar`, y **sólo la
  primera vez**: aprobar de nuevo deja intactas las correcciones hechas a mano, que es lo único que
  un comisario no perdonaría.
  > El test de la transacción única se verificó **rompiéndolo**: con la grilla en su propia
  > transacción, los equipos quedan aprobados y la grilla vacía, y el test falla. Es exactamente el
  > estado que dejaría una práctica imposible de cerrar.

- [x] **T-722** `GET /practices/:id/grid`: la grilla con la cuenta por persona.
  Verificación: cualquiera con sesión en el club la ve (plan §4); otra práctica de **otro club**
  responde 404, nunca 403 (P-05); la cuenta que viaja es la de `chukkersPorPersona` y no otra;
  una práctica sin equipos aprobados no tiene grilla.
  ✅ 2026-08-27 — 6 tests. La cuenta viaja **calculada en la respuesta**: la pantalla la muestra, no
  la recalcula, para que sea literalmente el mismo número que va a usar el cobro de Fase 3.
  > El aislamiento quedó declarado en el arnés genérico (`espera: "ajeno"`), que es donde encaja: a
  > diferencia del resto de rutas de práctica, ésta recibe un identificador y no necesita cuerpo ni
  > un estado concreto para significar algo. El arnés **falló hasta declararla**, que es su trabajo.
  > El test propio se rehízo con un comisario de verdad del otro club: con la sesión de este club,
  > el guard de tenant respondía antes y el 404 no probaba nada de la grilla.

- [x] **T-723** `PATCH /practices/:id/grid`: el lote de cambios, atómico.
  Verificación: **intercambiar dos jugadores del mismo chukker funciona** —es el caso que falla con
  una sola pasada, el escalón de `051` T-632—; un lote con un cambio inválido **no aplica ninguno**;
  vaciar una celda baja la cuenta; poner a alguien de otro club se rechaza; un jugador sin
  `practice.manage` recibe 403.
  ✅ 2026-08-27 — 9 tests. Las dos pasadas resuelven el intercambio; **verificado quitándolas**:
  sin la primera, el intercambio y el vaciado fallan contra el `UNIQUE` en el estado intermedio.
  > **El arnés de aislamiento me hizo declarar la ruta, y el primer intento pasaba en vacío.** Metí
  > la de lectura en el recorrido genérico y daba verde: el recorrido no crea una práctica del club
  > víctima ni sustituye `:id` para prácticas, así que la URL llegaba con `:id` literal y el 404
  > salía por inexistente. Las dos rutas pasaron a tener test propio, con un comisario de verdad del
  > otro club.
  > Y un test mío estaba mal: creía que un lote era inválido cuando no lo era, porque el primer
  > cambio vaciaba la celda que el segundo iba a ocupar. El servicio valida **la grilla resultante**,
  > no cada cambio por separado, que es la semántica correcta.

- [x] **T-724** `POST /practices/:id/no-show`: marcar y vaciar sus celdas, en una transacción
  (R-052-03).
  Verificación: marcar ausente a quien tiene celdas las vacía **todas**; poner en una celda a alguien
  ya marcado ausente se rechaza; los dos sentidos se prueban, porque la regla no la sostiene ninguna
  restricción de base de datos.
  ✅ 2026-08-27 — 8 tests. Las dos direcciones verificadas rompiéndolas: marcar sin vaciar las
  celdas hace fallar 5 tests, y quitar el guard inverso hace fallar 1. La invariante no la sostiene
  ninguna restricción de base —cruza dos tablas—, así que tenía que sostenerla el servicio.
  > **HU-052-04 se contradecía a sí misma y hubo que corregir el spec.** Pedía que marcar ausente
  > vaciara las celdas de una vez **y** que se rechazara marcar a quien tuviera celdas. Con la
  > grilla naciendo llena, todos tienen celdas desde el primer segundo: la segunda regla habría
  > hecho imposible marcar a nadie. La invariante se sostiene igual, pero en la otra dirección.
  > Y apareció un callejón sin salida que yo mismo había creado: el mensaje de error decía «quita la
  > marca», y no había con qué. Desmarcar existe ahora, y **no restaura las celdas** — el sistema no
  > sabe qué chukkers jugó, y devolverle los seis sería inventar el dato que el módulo registra.

- [x] **T-725** `POST /practices/:id/close` y `/reopen`, con candado.
  Verificación: cerrar deja `played`, con quién y cuándo, y la grilla deja de admitir cambios;
  cerrar algo que no empezó se rechaza (R-052-07); reabrir vuelve a `confirmed` y **deja rastro en
  `audit_log`**; un `PATCH` en vuelo contra una práctica que se está cerrando **espera el candado**
  y no entra en una grilla congelada (lección de `030` T-332).
  ✅ 2026-08-27 — 9 tests. Cerrar y reabrir van en el controlador de prácticas, junto a publicar y
  cancelar: lo que se congela es la grilla, pero lo que cambia de estado es la práctica.
  > Verificado rompiendo las dos garantías: sin `puedeCerrar` se cierra una práctica que no empezó
  > (2 tests caen), y sin el congelado una práctica cerrada sigue admitiendo cambios (1 test cae).
  > El rastro de la reapertura se comprueba **en `audit_log`**, no en la respuesta: si el rastro se
  > perdiera, cerrar dejaría de significar algo, y `audit_log` es append-only por P-07.

- [~] **T-726** `PUT /practices/:id/result`: el marcador, opcional. **APLAZADA el 2026-08-27.**
  Es la única tarea de este módulo que no hace falta para el hito del MVP —«el club deja
  WhatsApp»—, y su propia regla dice que el resultado no le cambia nada a nadie (R-052-09). La
  tabla `practice_result` **ya existe** con su migración y sus tests de esquema, así que retomarla
  es escribir una ruta, no rehacer nada. Se vuelve a ella cuando el uso real la pida — o nunca, que
  también es una respuesta.
  Verificación: se guarda con notas y sin notas; se puede corregir; cerrar **sin** marcador funciona
  (R-052-09); goles negativos se rechazan.

- [x] **T-727** La grilla **no** aparece embebida en el listado de prácticas.
  Verificación: test de contrato del listado que serializa la respuesta entera y comprueba que no
  trae celdas. Es el presupuesto de la interfaz, y es el criterio de `specs/040` T-451.
  ✅ 2026-08-27 — 2 tests, listado y detalle.
  > **La primera mutación con que lo verifiqué no lo detectó, y eso enseñó algo.** Añadí la grilla
  > al `include` de Prisma y el test siguió en verde: el servicio mapea a un DTO explícito, así que
  > un `include` de más nunca llega al JSON. La filtración real sólo puede entrar por el DTO — y
  > metiéndola ahí, los dos tests caen. La red está donde tiene que estar.

> **Sección C cerrada el 2026-08-27**, con T-726 aplazada a propósito. 587 tests de integración
> (541 al empezar el módulo). Las cinco rutas nuevas quedaron declaradas en el arnés de aislamiento
> **con test propio**, después de descubrir que el recorrido genérico las daba por buenas sin
> probarlas.

## D — Interfaz

- [x] **T-731** La grilla del comisario, **recorrida por jugador** (plan §7).
  Verificación: una fila por persona con sus chukkers como fichas de 44 px; un toque apaga un
  chukker y la cuenta de esa fila baja **en la misma pantalla**; se prueba a 375 px de ancho, que es
  el celular real, no el escritorio angosto.
  ✅ 2026-08-27 — 14 tests (la sección D entera en un archivo). Fichas de 44 px, una fila por
  jugador, y `aria-pressed` para que el estado no viva sólo en el color de fondo.
  > **Sin estado local, al revés que la pantalla de equipos.** Allá el comisario prueba alternativas
  > antes de decidir y la latencia mataba la función; acá cada toque es un hecho que ya ocurrió, y
  > guardarlos en lote sólo abriría la puerta a perderlos al cerrar la pestaña.

- [x] **T-732** La sustitución: «entró Pedro por Luis».
  Verificación: elegir a Pedro traspasa los chukkers marcados de Luis; Luis queda en cero y sigue
  visible —no desaparece de la pantalla, porque estuvo—; se puede elegir a alguien que **no se
  postuló** (R-052-05).
  ✅ 2026-08-27 — traspasa los chukkers en **un solo lote**, porque es un intercambio: de a uno, el
  primero chocaría contra el `UNIQUE`. Verificado mandándolos de a uno — el test cae.
  > La lista de personas sale de `GET /handicaps` y **no de `GET /users`**, que exige `user.edit` y
  > el comisario no tiene. Es el mismo agujero de `specs/030` T-343, evitado esta vez por saberlo.

- [x] **T-733** Cerrar y reabrir desde la pantalla.
  Verificación: cerrar pide confirmación y deja la grilla en sólo lectura; reabrir la devuelve a
  editable; una práctica que no empezó **no muestra el botón de cerrar**, en vez de mostrarlo y
  fallar.
  ✅ 2026-08-27 — cerrar y reabrir, con el botón de cerrar **siempre visible**: esconderlo cuando la
  práctica no ha empezado obligaría a la pantalla a saber la hora del club, que es una regla del
  dominio. El API la rechaza con su motivo, y la pantalla lo muestra.

- [x] **T-734** La fila del jugador en el detalle de la práctica.
  Verificación: un jugador ve sus chukkers y su cuenta; no ve botones de edición; una práctica que
  no jugó no le muestra una fila vacía sino que lo dice.
  ✅ 2026-08-27 — la fila del jugador en el detalle: sus chukkers y su cuenta, sin botones. La
  cuenta **viene calculada del servidor** (R-052-02): recalcularla acá sería una segunda
  implementación del número del que va a colgar el cobro.

> **Sección D cerrada el 2026-08-27.** 182 tests de interfaz (168 al empezar). Presupuesto de
> carga: 126.1 KB de 200. Dos bugs los encontraron los tests, no yo: el error de cerrar se leía de
> **otra instancia** del hook y no aparecía nunca; y los once códigos de error nuevos no tenían
> texto en `es-CO.ts`, así que el cliente —que traduce por código y nunca muestra el `message` del
> servidor— habría mostrado el genérico. La consola avisa de eso, y por eso se vio.

## E — Cierre

- [ ] **T-741** E2E de navegador: aprobar equipos → corregir un chukker → cerrar → verificar la
  cuenta.
  Verificación: corre **dos veces seguidas** sobre la misma base (la lección de `030` T-34x) y contra
  una base **recién sembrada** (la de `051` T-641, que pasaba en local y fallaba siempre en CI).

- [ ] **T-742** Arnés de aislamiento con las seis rutas nuevas.

- [ ] **T-743** `verification.md`: cada criterio de aceptación con el archivo y el título literal del
  test que lo cubre. Un criterio sin test **se resuelve, no se anota**.

- [ ] **T-744** Semilla: una práctica **cerrada con grilla** en `pnpm db:seed`, para que la pantalla
  del jugador tenga algo que mostrar sin tener que jugar una práctica a mano.
  > `051` T-641 se perdió una tarde por una semilla que no dejaba el sistema en el estado que el
  > E2E suponía. La semilla es parte del módulo, no un extra.
