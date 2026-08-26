# TASKS-052 — Grilla de chukkers, asistencia y resultado

> Cada tarea: una sesión, un commit (`docs/10` §2).
> Si una tarea, al hacerla, resulta tocar más de 5 archivos o 400 líneas de diff: detente y avisa.

**Numeración `T-7XX`.**

El dominio va primero, como siempre. Acá la promesa del módulo es más humilde que la de `051` —no
decide nada— pero es la que va a costar plata si falla: **el número de chukkers de una persona**. Ese
número lo va a leer el cobro de Fase 3, y si sale mal se cobra mal.

## A — Dominio puro

- [ ] **T-701** `grillaInicial`: cada puesto en todos los chukkers (R-052-01).
  Verificación: 8 puestos × 6 chukkers da 48 celdas y ninguna repetida; un puesto de medio hombre
  queda a nombre del **titular** (R-052-08); con 7 y con 8 chukkers sale lo que debe; con cero
  puestos devuelve vacío en vez de romper.

- [ ] **T-702** `chukkersPorPersona`: la cuenta, contada de las celdas y de ningún otro lado
  (R-052-02).
  Verificación: quien está en 6 celdas cuenta 6; las celdas vacías **no cuentan para nadie**; un
  puesto compartido reparte según quién esté en cada celda, no mitad y mitad; alguien que no está en
  ninguna celda **no aparece en el resultado**, que es distinto de aparecer en cero.
  > La distinción del último criterio es la que separa «no jugó» de «no estaba», y es justo la que
  > el cobro va a necesitar.

- [ ] **T-703** `validarGrilla`: nadie dos veces en el mismo chukker (R-052-04).
  Verificación: la misma persona en dos celdas del mismo chukker se rechaza, **aunque sea en equipos
  distintos**; la misma persona en chukkers distintos se acepta; dos celdas vacías en el mismo
  chukker se aceptan; el error dice **quién** y **en qué chukker**, porque un rechazo que no lo diga
  obliga a buscar a mano en una matriz de 64 celdas.

- [ ] **T-704** `puedeCerrar`: contra el reloj inyectado (R-052-07).
  Verificación: una práctica confirmada que ya empezó se puede cerrar; una que empieza en una hora
  **no**; una cancelada no; una ya cerrada no; y **ningún `new Date()`** — el test fija el reloj y
  mueve la hora, no el sistema (P-08).

> Cierre de A: `packages/domain/src/practice/grid.ts` con cobertura ≥ 85 % (la del paquete).

## B — Datos

- [ ] **T-711** Esquema: `ChukkerGridCell` y `PracticeResult`, el estado `played`, y `closedAt` /
  `closedById` en `Practice`. Migración revisada **a mano** antes de aplicarla.
  Verificación: la migración aplica y revierte contra Postgres real; el `UNIQUE` de
  `(practice_id, chukker_no, person_id)` **rechaza** a la misma persona dos veces y **acepta** dos
  huecos; el comentario del enum que prometía `played` para `051` queda corregido en la misma
  migración.
  > Prisma tiene antecedentes en este repo (`030`: `DROP DEFAULT` sobre una columna GENERATED, que
  > PostgreSQL rechaza con 42601). El SQL se lee antes de aplicarlo, siempre.

- [ ] **T-712** La celda **no** cuelga del equipo: comprobar que un rearme no se lleva la grilla.
  Verificación: se aprueba, se corrige la grilla a mano, se vuelve a proponer equipos y se aprueba
  otra vez; **las correcciones siguen ahí**. Es el test que justifica que `team` sea una coordenada
  y no una llave foránea (plan §5).

## C — API

- [ ] **T-721** La grilla nace al aprobar, **en la misma transacción** que la aprobación
  (R-052-01).
  Verificación: aprobar deja 48 celdas; **si crear la grilla falla, no quedan equipos aprobados**;
  aprobar por segunda vez **no** recrea la grilla ni pisa lo corregido.

- [ ] **T-722** `GET /practices/:id/grid`: la grilla con la cuenta por persona.
  Verificación: cualquiera con sesión en el club la ve (plan §4); otra práctica de **otro club**
  responde 404, nunca 403 (P-05); la cuenta que viaja es la de `chukkersPorPersona` y no otra;
  una práctica sin equipos aprobados no tiene grilla.

- [ ] **T-723** `PATCH /practices/:id/grid`: el lote de cambios, atómico.
  Verificación: **intercambiar dos jugadores del mismo chukker funciona** —es el caso que falla con
  una sola pasada, el escalón de `051` T-632—; un lote con un cambio inválido **no aplica ninguno**;
  vaciar una celda baja la cuenta; poner a alguien de otro club se rechaza; un jugador sin
  `practice.manage` recibe 403.

- [ ] **T-724** `POST /practices/:id/no-show`: marcar y vaciar sus celdas, en una transacción
  (R-052-03).
  Verificación: marcar ausente a quien tiene celdas las vacía **todas**; poner en una celda a alguien
  ya marcado ausente se rechaza; los dos sentidos se prueban, porque la regla no la sostiene ninguna
  restricción de base de datos.

- [ ] **T-725** `POST /practices/:id/close` y `/reopen`, con candado.
  Verificación: cerrar deja `played`, con quién y cuándo, y la grilla deja de admitir cambios;
  cerrar algo que no empezó se rechaza (R-052-07); reabrir vuelve a `confirmed` y **deja rastro en
  `audit_log`**; un `PATCH` en vuelo contra una práctica que se está cerrando **espera el candado**
  y no entra en una grilla congelada (lección de `030` T-332).

- [ ] **T-726** `PUT /practices/:id/result`: el marcador, opcional.
  Verificación: se guarda con notas y sin notas; se puede corregir; cerrar **sin** marcador funciona
  (R-052-09); goles negativos se rechazan.

- [ ] **T-727** La grilla **no** aparece embebida en el listado de prácticas.
  Verificación: test de contrato del listado que serializa la respuesta entera y comprueba que no
  trae celdas. Es el presupuesto de la interfaz, y es el criterio de `specs/040` T-451.

## D — Interfaz

- [ ] **T-731** La grilla del comisario, **recorrida por jugador** (plan §7).
  Verificación: una fila por persona con sus chukkers como fichas de 44 px; un toque apaga un
  chukker y la cuenta de esa fila baja **en la misma pantalla**; se prueba a 375 px de ancho, que es
  el celular real, no el escritorio angosto.

- [ ] **T-732** La sustitución: «entró Pedro por Luis».
  Verificación: elegir a Pedro traspasa los chukkers marcados de Luis; Luis queda en cero y sigue
  visible —no desaparece de la pantalla, porque estuvo—; se puede elegir a alguien que **no se
  postuló** (R-052-05).

- [ ] **T-733** Cerrar y reabrir desde la pantalla.
  Verificación: cerrar pide confirmación y deja la grilla en sólo lectura; reabrir la devuelve a
  editable; una práctica que no empezó **no muestra el botón de cerrar**, en vez de mostrarlo y
  fallar.

- [ ] **T-734** La fila del jugador en el detalle de la práctica.
  Verificación: un jugador ve sus chukkers y su cuenta; no ve botones de edición; una práctica que
  no jugó no le muestra una fila vacía sino que lo dice.

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
