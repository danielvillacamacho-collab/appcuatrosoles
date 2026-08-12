# VERIFICATION-030 — Handicaps

> Cada criterio de aceptación de `spec.md`, con el archivo y el título literal del test que lo
> cubre. Un criterio sin test **se resuelve**, no se anota.

**Fecha de cierre:** 2026-08-11 · 317 tests de dominio · 472 de integración · 124 de interfaz ·
1 E2E de navegador · `packages/domain/src/handicap` al 100 % · `apps/api/src/handicaps` al 95 %

## HU-030-01 — El comisario fija el handicap de un jugador

| Criterio | Dónde se prueba |
|---|---|
| Sube medio gol y el vigente cambia | `handicaps.int-spec` «el comisario sube medio gol y el valor vigente cambia» · E2E «sube a 3 goles con su motivo» |
| Queda en el historial con anterior, nuevo, quién y cuándo | `handicaps.int-spec` «queda registrado en el historial, con el anterior que de verdad regía» |
| 1.3 se rechaza | `halves.spec` «NO redondea: 1.3 goles se rechaza en vez de volverse 2.5» · `change.spec` «un decimal que no es medio gol» · `handicap.spec` (web) «NO redondea: 2,3 se rechaza» · E2E ««2,3» no es un handicap» |
| 12 se rechaza | `halves.spec` «rechaza justo afuera de cada extremo» · `handicaps.int-spec` «fuera de rango» |
| El mismo valor se rechaza | `change.spec` «el mismo valor que ya rige, y el rechazo dice cuál es» · `handicaps.int-spec` «sin cambio, y el error dice cuál es el valor que ya rige» · E2E «fijar el mismo valor se rechaza» |
| Sin motivo se rechaza | `change.spec` «sin motivo» y «un motivo de sólo espacios…» · `handicaps.spec.tsx` «sin motivo no viaja nada: el formulario lo exige, no sólo el API» |

## HU-030-02 — Sólo el comisario

| Criterio | Dónde se prueba |
|---|---|
| El administrador del club no puede | `hasPermission.spec` «NO fija handicaps: la autoridad deportiva no viene con la administrativa» · `handicaps.int-spec` «el administrador del club NO puede fijar handicaps, aunque pueda todo lo demás» · `handicaps.spec.tsx` «un administrador NO ve el botón de fijar» |
| Un comisario de otro club responde 404 | `handicaps.int-spec` «una persona de otro club responde 404, nunca 403 (P-05)» · `hasPermission.spec` «el comisario de un club no fija handicaps de otro» |
| Un jugador no cambia el suyo | `handicaps.int-spec` «un jugador no puede cambiar su propio handicap» |
| **Añadido:** el superadministrador tampoco | `hasPermission.spec` «NO fija handicaps, aunque sea dueño de la plataforma» |

## HU-030-03 — Ver con cuánto juega cada quien

| Criterio | Dónde se prueba |
|---|---|
| Cualquiera con sesión ve los dos vigentes | `handicaps.int-spec` «el vigente SÍ es público: se ve el número, no la historia» · `handicaps.spec.tsx` «muestra los dos valores, en goles y con coma» |
| El historial de otro se rechaza | `visibility.spec` «otro jugador NO» · `handicaps.int-spec` «otro jugador NO lo ve, y recibe 404 y no 403» |
| La propia persona ve el suyo | `visibility.spec` «la propia persona sí» · `handicaps.int-spec` «la propia persona ve el suyo» |
| El acudiente ve el del menor | `visibility.spec` «el acudiente de un menor sí» · `handicaps.int-spec` «el acudiente ve el del menor a su cargo» |

## HU-030-04 — La evolución de un jugador

| Criterio | Dónde se prueba |
|---|---|
| Del más reciente al más antiguo, con todo | `handicaps.int-spec` «el comisario lo ve» · `handicaps.spec.tsx` «muestra el cambio, el motivo, quién y la temporada» · E2E «el cambio aparece en el historial» |
| Un historial vacío es dato, no ausencia | `handicap-schema.int-spec` «una persona recién creada no tiene NINGUNA fila» · `handicaps.spec.tsx` «un historial vacío lo dice, en vez de quedar en blanco» |

## Reglas transversales

| Regla | Dónde se prueba |
|---|---|
| R-030-03 medios goles enteros | `halves.spec` (13 tests) · `handicap-schema.int-spec` «un solo vigente por persona y tipo» |
| R-030-05 el defecto es −2 y lo distingue el historial | `handicap-schema.int-spec` «la ausencia de fila es un dato» · `handicaps.int-spec` «el primer cambio de todos parte de −4» · `handicaps.spec.tsx` «distingue «sin calificar» de un −2 puesto por el comisario» |
| R-030-10/11 el vigente no diverge del historial | `handicaps.int-spec` «tras varios cambios, el vigente RECONSTRUIDO desde el historial coincide con la fila» |
| R-030-12 sin temporada no se bloquea | `handicaps.int-spec` «sin temporada abierta el cambio se registra igual» y «con temporada abierta, la anota» |
| R-030-09 aislamiento y privacidad | arnés de aislamiento con las cuatro rutas · `handicaps.int-spec` «LA RESPUESTA ENTERA no filtra nada de un historial ajeno» |
| Concurrencia | `handicaps.int-spec` «el candado de fila hace esperar al segundo hasta que el primero termina» |

## Lo que se descubrió construyendo, y no estaba en el plan

1. **La red de permisos no cubría la dirección que importaba.** El plan afirmaba que agregar
   `handicap.edit` haría fallar el recorrido de roles × permisos. Se agregó el permiso solo, para
   verlo: **la suite pasó entera en verde**, con el administrador del club pudiendo fijar handicaps.
   El recorrido sólo caminaba los roles *operativos*; los administrativos —los únicos que se definen
   por resta y por lo tanto los únicos que pueden ganar un permiso solos— nunca se recorrían. Se
   escribió el test que faltaba: el conjunto **exacto** de permisos de cada rol administrativo.
2. **El test de concurrencia no probaba nada, y la implementación tampoco garantizaba nada.** El
   primero usaba `Promise.all` sobre dos peticiones HTTP y pasaba igual con la versión ingenua del
   servicio. Al mirarlo se vio que leer dentro de la transacción **no serializa**: PostgreSQL corre
   en `READ COMMITTED`. La garantía real es `SELECT … FOR UPDATE` sobre la persona.
3. **Prisma generó una migración que no aplica**: `ALTER COLUMN "time_range" DROP DEFAULT` sobre una
   columna GENERATED, que PostgreSQL rechaza con 42601. Queda advertido en la cabecera de la
   migración; toda migración futura hay que revisarla por esto.

4. **El E2E no era repetible.** Usaba un motivo fijo, y como el historial es append-only —y eso es
   justamente lo que el módulo promete— la segunda corrida encontraba dos entradas iguales. Además
   dependía del valor que dejaba la corrida anterior. Se arregló con un motivo único por corrida y
   un paso que lleva el handicap a un valor conocido antes de empezar. Comprobado tres veces
   seguidas.

Los cuatro se verificaron rompiendo a propósito lo que decían proteger. Un test que pasa igual con y
sin la garantía que dice probar es peor que no tenerlo.

## Pendientes declarados

- **El `REVOKE` de `handicap_history`** —append-only a nivel de base de datos, constitución regla 7—
  queda enganchado a **T-007**, el rol de mínimo privilegio, que va con AWS. Mientras la aplicación
  corra como dueña de las tablas ningún `REVOKE` la limita. La intención está escrita en el esquema;
  **la garantía todavía no existe**.
- **`on_behalf_of_id` está declarada y sin usar** hasta que exista la delegación en un subcomisario
  (`docs/09` Q-11, decidido el 2026-08-11: spec propio).
- **La misma persona en dos clubes tiene dos handicaps internacionales** que pueden divergir. Se
  acepta y se declara: hoy no hay identidad de persona entre clubes.
- **El listado del club no filtra por estado de la persona más allá de `active`.** Cuando 050
  necesite armar equipos con invitados, hay que revisarlo.
