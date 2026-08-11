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

- [ ] **T-310** El permiso `handicap.edit`, la lista `FUERA_DEL_ALCANCE_DEL_CLUB_ADMIN` y el
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

## C — Datos

- [ ] **T-320** Modelos `PlayerHandicap` y `HandicapHistory` con el enum `HandicapType`
  (`plan.md` §1), y la migración.
  Verificación: `up`/`down`/`up` contra Postgres real; el `@@unique([personId, type])` rechaza un
  segundo vigente para la misma persona y tipo; el índice del historial se usa al leerlo del más
  nuevo al más viejo.
  > Sin `CHECK` de rango a propósito (`plan.md` §1): esa regla es de polo y vive en el dominio.

- [ ] **T-321** La lectura del vigente cuando **no hay fila** (`plan.md` §2): `−4` medios y
  `calificado: false`.
  Verificación: una persona recién creada devuelve `−4`/`false`; después de un cambio a `−4`
  devuelve `−4`/**`true`** — el mismo número, distinto significado. Es el test que prueba que la
  decisión D-030-02 quedó bien implementada.

## D — API

- [ ] **T-330** `HandicapsService`: el **único** escritor, con la transacción de `plan.md` §5.
  Verificación: el vigente y el historial quedan escritos juntos; el «anterior» del registro es el
  que de verdad regía; la temporada vigente queda anotada, y **un club sin temporada abierta no
  bloquea el cambio** (R-030-12).

- [ ] **T-331** Vigente e historial **no divergen**, comprobado contra la base.
  Verificación: tras N cambios, **se reconstruye el vigente desde el historial** y se compara con la
  fila denormalizada. No basta con leer las dos y ver que coinciden: hay que recalcular.
  > Es el test que protege la promesa del módulo. Si algún día alguien agrega un camino de
  > escritura que se salta el historial, éste es el que lo dice.

- [ ] **T-332** Dos cambios **concurrentes** sobre la misma persona y tipo.
  Verificación: los dos quedan registrados, en orden, y ninguno anota un «anterior» que ya no era el
  actual. **Y se comprueba que el test falla** si el vigente se lee antes de abrir la transacción —
  con el mismo método de `specs/040` T-422: un test que pasa igual con y sin la garantía que dice
  probar es peor que no tenerlo.

- [ ] **T-333** `PUT /people/:id/handicaps/:type` y `GET /people/:id/handicaps`.
  Verificación: contrato de entrada y salida; `club_admin` **denegado** en el `PUT`; una persona de
  otro club responde **404 y no 403**; los cuatro rechazos del dominio llegan con su código propio.

- [ ] **T-334** `GET /people/:id/handicaps/history`, con R-030-09 aplicada **en el servicio**.
  Verificación: los seis casos de visibilidad de punta a punta; **el test serializa la respuesta
  completa** y falla si aparece cualquier motivo o autor de un historial ajeno — el mismo criterio
  que `specs/040` T-451, por la misma razón: comprobar campos conocidos no ve el dato que alguien
  agregue mañana.

- [ ] **T-335** `GET /handicaps?type=club`, paginado (25 por defecto, 100 máximo, >100 es 400).
  Verificación: la paginación con sus tres casos; el listado **no incluye personas de otro club**;
  incluye a quien no ha sido calificado, con `calificado: false`.

- [ ] **T-336** Las cuatro rutas declaradas en el arnés de aislamiento.
  Verificación: `pnpm check:isolation` en verde. El listado y el historial necesitan caso propio: su
  aislamiento es por **lo que devuelven**, no por el identificador que se les pide.

## E — Interfaz

- [ ] **T-340** El handicap en el perfil de una persona: los dos valores, y «sin calificar» cuando
  corresponde.
  Verificación: `1.5` se muestra «1,5» en es-CO; `−2` se muestra con el signo correcto; quien no ha
  sido calificado se distingue de quien fue calificado en −2.
  > La conversión a texto es de la interfaz, no del dominio (constitución, regla 1).

- [ ] **T-341** Fijar el handicap (sólo comisario), con el motivo obligatorio en el formulario.
  Verificación: **la pantalla no existe para quien no es comisario** —ni el botón—; sin motivo no
  viaja nada; los cuatro rechazos se explican con el texto del club y no con el del servidor.

- [ ] **T-342** El historial, del más nuevo al más viejo, con motivo, autor, fecha y temporada.
  Verificación: un historial vacío dice «nunca ha sido calificado» y no queda en blanco; a quien no
  puede verlo no se le ofrece el enlace.

## F — Cierre

- [ ] **T-350** E2E de navegador: el comisario sube a un jugador medio gol, el valor nuevo se ve en
  el perfil, el cambio aparece en el historial con su motivo, y un administrador **no** ve el botón
  de editar.
  > Deja el jugador como estaba al terminar: la base de desarrollo no se limpia entre corridas.

- [ ] **T-351** `verification.md` con cada criterio de aceptación mapeado a su test.
  Cualquier criterio sin test identificado **se resuelve antes** de dar el módulo por terminado.
  > En `specs/010` esta tarea destapó cuatro criterios que no estaban implementados. En `specs/040`
  > confirmó que los tres tests importantes se habían verificado a sí mismos. No es papeleo.
