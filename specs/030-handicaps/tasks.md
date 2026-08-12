# TASKS-030 — Handicaps

> Cada tarea: una sesión, un commit (`docs/10` §2).
> Si una tarea, al hacerla, resulta tocar más de 5 archivos o 400 líneas de diff: detente y avisa —
> la tarea estaba mal partida.

**Numeración `T-3XX`.**

**El orden aquí importa por una razón distinta a la de `specs/040`.** Allá el dominio iba primero
porque las reglas de solapamiento eran el cimiento. Aquí va primero porque **la sección B rompe una
prueba existente a propósito**: agregar `handicap.edit` hace fallar el recorrido de roles ×
permisos, y ese fallo es la señal de que la excepción del `club_admin` hay que escribirla a mano.
Conviene que ocurra cuando no hay nada más a medio hacer.

## A — Dominio puro

- [x] **T-301** `HandicapHalves`, `goalsToHalves`, `halvesToGoals` y `validarHandicap`
  (`plan.md` §3). El tipo se construye **sólo** por `validarHandicap`.
  Verificación: −2 goles ↔ −4 medios y 10 ↔ 20 en los dos sentidos; 1.5 goles → 3 medios; se
  rechazan 21, −5, 1.3 y `NaN`. Ida y vuelta para todo el rango válido sin pérdida.
  > El redondeo es el error silencioso de este módulo: un jugador de 2.5 que pasa a 2 no rompe
  > nada, sólo desequilibra los equipos y nadie sabe por qué.

- [x] **T-302** `planearCambioDeHandicap` y la unión `RechazoDeCambio` (`spec.md` §9).
  Verificación: los cuatro rechazos con su razón distinguible —`fuera_de_rango`, `no_es_medio_gol`,
  `sin_motivo`, `sin_cambio`—, un motivo de sólo espacios se rechaza, y un cambio válido devuelve el
  anterior y el nuevo.
  > `sin_cambio` (R-030-08) es el que se olvida. Sin él, el historial se llena de filas idénticas y
  > deja de servir para lo único que existe.

- [x] **T-303** `handicapDelEquipo` (`spec.md` §9). Suma en medios goles.
  Verificación: la suma de cuatro jugadores; un equipo vacío da 0; la suma **no** se sale del tipo
  —el total de un equipo puede pasar de 20 medios y eso es válido, porque el rango −4..20 acota a un
  jugador, no a un equipo.
  > Vive aquí y no en 050 porque es aritmética de handicap. La regla del «medio hombre» —el puesto
  > compartido pesa el más alto de los dos— **no** entra: eso es composición de equipos, y es de 050.

- [x] **T-304** `puedeVerElHistorial` (`plan.md` §7).
  Verificación: los seis casos —comisario, administrador, la propia persona, el acudiente de un
  menor, otro jugador, sin sesión—. El caso «sin sesión» se prueba explícitamente con `personId`
  nulo, que es como llega.
  ✅ 2026-08-11 — 8 tests, los seis casos más dos bordes: sin sesión sigue siendo «no» aunque
  llegaran roles puestos, y ser acudiente de uno no da acceso al historial de otro.

> **Sección A cerrada el 2026-08-11.** 36 tests, `packages/domain/src/handicap` al 100 % de líneas
> y ramas. Nada de esto toca la base de datos ni sabe de roles: son las cuatro reglas que el resto
> del módulo va a consultar.

## B — Permisos

- [x] **T-310** El permiso `handicap.edit`, la lista `FUERA_DEL_ALCANCE_DEL_CLUB_ADMIN` y el
  comisario con su segunda autoridad (`plan.md` §6).
  Verificación: **el recorrido roles × ámbitos × permisos falla al agregar el permiso, y se
  actualiza agregando la excepción explícita, nunca sacando al rol del recorrido.** Además: el
  administrador del club es **denegado**; el comisario de otro club es denegado; el comisario puede
  `field.block` y `handicap.edit` y nada más.
  > Esta tarea es la que justifica el módulo desde el punto de vista de la seguridad. Hoy
  > `club_admin` se define por resta —«todo menos administrar la plataforma»— y **verificamos que
  > hereda solo los permisos nuevos**. `handicap.edit` es el primero que tiene que quedar fuera, y
  > si esto se hace mal no falla nada: simplemente el administrador puede tocar handicaps para
  > siempre, y nadie se entera hasta que lo haga.
  ✅ 2026-08-11 — **y la predicción de esta tarea era falsa, lo que resultó ser el hallazgo.**
  El plan decía que el recorrido roles × permisos fallaría al agregar `handicap.edit`. Se agregó el
  permiso solo, sin tocar nada más, para verlo: **la suite pasó entera en verde**, con el
  administrador del club pudiendo fijar handicaps.
  > El motivo: ese recorrido **sólo camina los roles operativos** —comisario, instructor, petisero,
  > tesorero, jugador—. Los administrativos, que son los que se definen por resta y por lo tanto los
  > únicos que pueden ganar un permiso solos, nunca se recorrían. La red que el plan daba por
  > existente cubría justo la dirección contraria a la que importaba.
  > Se arregló lo uno y lo otro: la lista `AUTORIDAD_DEPORTIVA`, y **un test nuevo que afirma el
  > conjunto exacto de permisos de cada rol administrativo**, escrito a mano. Ahora agregar un
  > permiso obliga a decidir explícitamente qué pasa con cada rol: el test falla hasta que alguien
  > lo escriba. Verificado devolviéndole el permiso al `club_admin`: cuatro tests fallan, uno
  > diciendo «los permisos de superadmin cambiaron sin que nadie lo decidiera».
  > **El `superadmin` también queda fuera** (R-030-02). No es que no pueda: puede asignarse el rol
  > de comisario, que para eso tiene `role.assign`. La diferencia es que así **queda registrado** —
  > una autoridad que se toma deja rastro donde una autoridad que se tiene no deja ninguno.
  > Y un test viejo cayó por buenas razones: «cada permiso es ejercible por alguien» preguntaba
  > «¿puede el superadmin?», usándolo de donante universal. La pregunta nunca fue ésa. Ahora recorre
  > todos los roles.

> **Sección B cerrada el 2026-08-11.** 29 tests en `hasPermission`, 317 en el dominio.

## C — Datos

- [x] **T-320** Modelos `PlayerHandicap` y `HandicapHistory` con el enum `HandicapType`
  (`plan.md` §1), y la migración.
  Verificación: `up`/`down`/`up` contra Postgres real; el `@@unique([personId, type])` rechaza un
  segundo vigente para la misma persona y tipo; el índice del historial se usa al leerlo del más
  nuevo al más viejo.
  > Sin `CHECK` de rango a propósito (`plan.md` §1): esa regla es de polo y vive en el dominio.
  ✅ 2026-08-11 — 10 tests contra la base, sin pasar por la aplicación (mismo criterio que T-401).
  > **Prisma generó una migración rota y hubo que arreglarla a mano.** Metió
  > `ALTER TABLE "field_booking" ALTER COLUMN "time_range" DROP DEFAULT`, porque `time_range` está
  > declarada `Unsupported("tstzrange")?` —Prisma no sabe expresar una columna GENERATED— y cree en
  > cada migración nueva que le falta un default. PostgreSQL la rechaza con
  > `ERROR 42601: column "time_range" ... is a generated column`, y **la migración entera falla**.
  > Comprobado contra Postgres real antes de borrarla, y comprobado después que con la línea puesta
  > la suite de integración **no arranca**: `migrate deploy` corre desde cero en el arranque, así que
  > la red ya existía. Queda escrito en la cabecera de la migración: **toda migración futura hay que
  > revisarla por esto.**
  > También hubo que rehacer el esquema desde cero: la primera edición usó como ancla un comentario
  > que aparece en **ocho** modelos, y quedaron siete columnas de basura en cada tabla nueva. La
  > segunda vez la edición se acotó al bloque de cada modelo y verifica que el ancla sea única.

- [x] **T-321** La lectura del vigente cuando **no hay fila** (`plan.md` §2): `−4` medios y
  `calificado: false`.
  Verificación: una persona recién creada devuelve `−4`/`false`; después de un cambio a `−4`
  devuelve `−4`/**`true`** — el mismo número, distinto significado. Es el test que prueba que la
  decisión D-030-02 quedó bien implementada.
  ✅ 2026-08-11 — cubierto en el mismo archivo. Se comprueba que una persona recién creada **no
  tiene ninguna fila**, ni de vigente ni de historial, y que las dos señales van siempre juntas.
  > Hay además un test que documenta lo contrario de lo habitual: **la base acepta un 999**. El
  > rango es una regla de polo y vive en el dominio; duplicarla en SQL crearía dos verdades capaces
  > de desincronizarse. Lo que impide que un 999 llegue es `validarHandicap`.

> **Sección C cerrada el 2026-08-11.** 418 tests de integración con la migración aplicada desde
> cero contra Postgres real.

## D — API

- [x] **T-330** `HandicapsService`: el **único** escritor, con la transacción de `plan.md` §5.
  Verificación: el vigente y el historial quedan escritos juntos; el «anterior» del registro es el
  que de verdad regía; la temporada vigente queda anotada, y **un club sin temporada abierta no
  bloquea el cambio** (R-030-12).
  ✅ 2026-08-11 — 30 tests. Un rechazo **no deja rastro** en el historial: la transacción no se abre
  a medias.

- [x] **T-331** Vigente e historial **no divergen**, comprobado contra la base.
  Verificación: tras N cambios, **se reconstruye el vigente desde el historial** y se compara con la
  fila denormalizada. No basta con leer las dos y ver que coinciden: hay que recalcular.
  > Es el test que protege la promesa del módulo. Si algún día alguien agrega un camino de
  > escritura que se salta el historial, éste es el que lo dice.
  ✅ 2026-08-11 — reconstruye la cadena encadenando cinco cambios: cada «anterior» tiene que ser el
  «nuevo» del paso previo, empezando en −4.

- [x] **T-332** Dos cambios **concurrentes** sobre la misma persona y tipo.
  Verificación: los dos quedan registrados, en orden, y ninguno anota un «anterior» que ya no era el
  actual. **Y se comprueba que el test falla** si el vigente se lee antes de abrir la transacción —
  con el mismo método de `specs/040` T-422: un test que pasa igual con y sin la garantía que dice
  probar es peor que no tenerlo.
  ✅ 2026-08-11 — **y aquí apareció el hallazgo del módulo.** El primer test de concurrencia lanzaba
  dos peticiones con `Promise.all`, y **pasaba igual con la versión ingenua del servicio** —el
  vigente leído *antes* de abrir la transacción—. Comprobado a propósito, que es lo que lo destapó:
  dos peticiones HTTP no se solapan de forma fiable.
  > Peor: al mirarlo se vio que **la implementación tampoco garantizaba nada**. El comentario del
  > servicio decía que leer dentro de la transacción impedía la carrera, y es falso: PostgreSQL
  > corre en `READ COMMITTED` —verificado con `SHOW transaction_isolation`—, así que dos
  > transacciones leen las dos el mismo valor y las dos anotan el mismo «anterior».
  > La garantía real es un **candado de fila**: `SELECT … FOR UPDATE` sobre la persona. Sobre la
  > persona y no sobre el handicap porque la fila del handicap puede no existir todavía —el primer
  > cambio— y no se puede bloquear lo que no está.
  > El test nuevo fuerza el solape a mano: A toma el candado y se queda dentro; se comprueba que B
  > **no ha leído nada** mientras tanto; A suelta, y B lee lo que A escribió. Verificado quitándole
  > el `FOR UPDATE` a B: falla con «B leyó sin esperar: el candado no está haciendo nada».
  > El test de `Promise.all` se quedó, renombrado a lo que de verdad comprueba —que la cadena queda
  > intacta— y con la advertencia de que no prueba la garantía.

- [x] **T-333** `PUT /people/:id/handicaps/:type` y `GET /people/:id/handicaps`.
  Verificación: contrato de entrada y salida; `club_admin` **denegado** en el `PUT`; una persona de
  otro club responde **404 y no 403**; los cuatro rechazos del dominio llegan con su código propio.
  ✅ 2026-08-11 — el administrador del club recibe **403** al intentar fijar un handicap, que es la
  regla del módulo probada de punta a punta.
  > De paso: las mutaciones de los tests necesitan la cabecera CSRF. Armarlas a mano daba 403 y
  > parecía un problema de permisos; se usa el helper `conSesion` del repo, que pone las dos cosas.

- [x] **T-334** `GET /people/:id/handicaps/history`, con R-030-09 aplicada **en el servicio**.
  Verificación: los seis casos de visibilidad de punta a punta; **el test serializa la respuesta
  completa** y falla si aparece cualquier motivo o autor de un historial ajeno — el mismo criterio
  que `specs/040` T-451, por la misma razón: comprobar campos conocidos no ve el dato que alguien
  agregue mañana.
  ✅ 2026-08-11 — los seis casos de punta a punta, incluido el acudiente viendo el historial de un
  menor. La respuesta entera se serializa y se busca el motivo, la persona y el autor.
  > `esAdministrador` se resuelve **por rol y no por permiso**: el permiso que venía a la mano
  > —`handicap.edit`— no lo tiene el administrador del club, y usarlo aquí le habría cerrado la
  > lectura del historial, que sí le corresponde.

- [x] **T-335** `GET /handicaps?type=club`, paginado (25 por defecto, 100 máximo, >100 es 400).
  Verificación: la paginación con sus tres casos; el listado **no incluye personas de otro club**;
  incluye a quien no ha sido calificado, con `calificado: false`.
  ✅ 2026-08-11 — parte de `person` y no de `player_handicap`, justamente para que quien nunca fue
  calificado aparezca. Listar sólo a los calificados dejaría a quien arma equipos creyendo que el
  resto no existe.

- [x] **T-336** Las cuatro rutas declaradas en el arnés de aislamiento.
  Verificación: `pnpm check:isolation` en verde. El listado y el historial necesitan caso propio: su
  aislamiento es por **lo que devuelven**, no por el identificador que se les pide.
  ✅ 2026-08-11 — **cierra la sección D.** Las cuatro con test propio, cada una por un motivo
  distinto: el `PUT` necesita cuerpo válido *y* un actor con `handicap.edit` —que el recorrido
  genérico no tiene, porque el comisario no es un rol administrativo—; el historial se acota además
  **por persona**, así que dos jugadores del mismo club tampoco se ven el de otro.

> **Sección D cerrada el 2026-08-11.** 472 tests de integración, `src/handicaps` al 95 %.

## E — Interfaz

- [x] **T-340** El handicap en el perfil de una persona: los dos valores, y «sin calificar» cuando
  corresponde.
  Verificación: `1.5` se muestra «1,5» en es-CO; `−2` se muestra con el signo correcto; quien no ha
  sido calificado se distingue de quien fue calificado en −2.
  > La conversión a texto es de la interfaz, no del dominio (constitución, regla 1).
  ✅ 2026-08-11 — 8 tests de conversión + 4 de pantalla. Se engancha a la ficha de usuario que ya
  existe: el handicap es un dato de la persona, y una pantalla aparte obligaría a navegar para
  responder «¿con cuánto juega?».
  > El signo es el menos de verdad (−, U+2212) y no un guión: en «−2» un guión se lee como
  > separador.

- [x] **T-341** Fijar el handicap (sólo comisario), con el motivo obligatorio en el formulario.
  Verificación: **la pantalla no existe para quien no es comisario** —ni el botón—; sin motivo no
  viaja nada; los cuatro rechazos se explican con el texto del club y no con el del servidor.
  ✅ 2026-08-11 — **el comisario escribe goles y el API recibe medios goles.** La conversión rechaza
  «2,3» en vez de redondearlo, igual que el dominio: redondear dejaría al jugador con un valor que
  nadie eligió.

- [x] **T-342** El historial, del más nuevo al más viejo, con motivo, autor, fecha y temporada.
  Verificación: un historial vacío dice «nunca ha sido calificado» y no queda en blanco; a quien no
  puede verlo no se le ofrece el enlace.
  ✅ 2026-08-11 — **cierra la sección E.** `retry: false` en la consulta: a quien no puede verlo el
  API le responde 404, y reintentarlo sólo demora el momento en que la pantalla deja de decir
  «cargando». Hay un test que cuenta los intentos.

## F — Cierre

- [x] **T-350** E2E de navegador: el comisario sube a un jugador medio gol, el valor nuevo se ve en
  el perfil, el cambio aparece en el historial con su motivo, y un administrador **no** ve el botón
  de editar.
  > Deja el jugador como estaba al terminar: la base de desarrollo no se limpia entre corridas.
  ✅ 2026-08-11 — sube, verifica el historial, choca contra «ya tiene ese handicap», rechaza «2,3» y
  vuelve a dejarlo en −2.
  > Tres tropiezos de localización, los tres reales: el primer `a[href^="/users/"]` era el botón de
  > **crear**; el listado pinta **las dos formas a la vez** —tarjetas y tabla— y `.first()` elegía la
  > oculta, con el clic esperando para siempre; y `getByText("Handicaps")` casaba con tres elementos.
  > Se localiza por rol y por visibilidad.
  > **Y no era repetible.** El motivo era fijo, así que la segunda corrida encontraba dos entradas
  > iguales en el historial —que es append-only y no se puede limpiar, y eso es el punto del
  > módulo—. Peor: dependía del valor con que lo dejó la corrida anterior, así que una corrida que
  > fallara a mitad rompía la siguiente. Se arregló con un motivo único por corrida y un paso que
  > **lleva el handicap a un valor conocido venga de donde venga**. Comprobado corriéndolo tres
  > veces seguidas.

- [x] **T-351** `verification.md` con cada criterio de aceptación mapeado a su test.
  Cualquier criterio sin test identificado **se resuelve antes** de dar el módulo por terminado.
  > En `specs/010` esta tarea destapó cuatro criterios que no estaban implementados. En `specs/040`
  > confirmó que los tres tests importantes se habían verificado a sí mismos. No es papeleo.
  ✅ 2026-08-11 — **cierra el módulo 030.** Mapa completo, más una sección de lo que se descubrió
  construyendo y no estaba en el plan, y cuatro pendientes declarados — el mayor: el `REVOKE` de
  append-only depende de T-007, así que **la intención está escrita y la garantía todavía no
  existe**.
