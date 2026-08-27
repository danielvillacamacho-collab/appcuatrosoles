# VERIFICATION-052 — Grilla de chukkers, asistencia y resultado

> Cada criterio de aceptación de `spec.md`, con el archivo y el título literal del test que lo
> cubre. Un criterio sin test **se resuelve**, no se anota.

**Fecha de cierre:** 2026-08-27 · 412 tests de dominio · 590 de integración · 182 de interfaz ·
9 E2E de navegador (1 de grilla) · `packages/domain/src/practice/grid.ts` al **100 %** ·
`apps/api/src/practices/grid.service.ts` al 93,8 %

## HU-052-01 — La grilla nace llena

| Criterio | Dónde se prueba |
|---|---|
| Al aprobar quedan las celdas puestas, cada puesto en todos los chukkers | `grid.spec` «8 puestos y 6 chukkers dan 48 celdas, sin repetir ningún lugar» y «todos juegan todos los chukkers» · `teams.int-spec` «aprobar hace nacer la grilla, llena» |
| Un puesto compartido nace a nombre del titular | `grid.spec` «un puesto compartido nace a nombre del TITULAR, no repartido entre los dos» |
| Sin equipos aprobados no hay grilla | `grid.int-spec` «una práctica SIN equipos aprobados no tiene grilla: 404» · `grilla.spec.tsx` «una práctica sin grilla lo DICE, en vez de quedar en blanco» |
| **Añadido:** nace en la misma transacción que la aprobación | `teams.int-spec` «si la grilla falla, NO quedan equipos aprobados: es una sola transacción» |
| **Añadido:** aprobar de nuevo no pisa lo corregido | `teams.int-spec` «aprobar POR SEGUNDA VEZ no pisa la grilla corregida a mano» |

## HU-052-02 — Corregir las excepciones

| Criterio | Dónde se prueba |
|---|---|
| Sacar a alguien baja su cuenta en la misma pantalla | `grid.int-spec` «vaciar una celda baja la cuenta de esa persona» · E2E «un toque quita a alguien de un chukker y la cuenta baja» |
| Quien entra se queda la celda y el reemplazado no | `grilla.spec.tsx` «traspasa a quien entra LOS CHUKKERS del que sale, en un solo lote» |
| Nadie dos veces el mismo chukker | `grid.spec` «se rechaza AUNQUE sea en equipos distintos» · `grid-schema.int-spec` «tampoco en el OTRO equipo» · `grid.int-spec` «la misma persona dos veces en un chukker se rechaza, y el error dice cuál» |
| Una práctica cerrada no admite cambios | `grid.int-spec` «cerrada, la grilla NO admite cambios» · `grilla.spec.tsx` «cerrada, la grilla se ve pero NO se toca» |
| **Añadido:** intercambiar dos jugadores del mismo chukker | `grid.int-spec` «INTERCAMBIAR dos jugadores del mismo chukker funciona» |
| **Añadido:** un lote con un cambio inválido no aplica ninguno | `grid.int-spec` «un lote con un cambio inválido NO aplica ninguno» |

## HU-052-03 — Cerrar la práctica

| Criterio | Dónde se prueba |
|---|---|
| Queda en `played`, con quién y cuándo, y la grilla se congela | `grid.int-spec` «cerrar deja la práctica en played, con quién y cuándo» · E2E «cerrar la congela» |
| Una que no empezó no se cierra | `grid.spec` «una que empieza en una hora NO se cierra» · `grid.int-spec` «una práctica que TODAVÍA NO EMPEZÓ no se cierra» |
| Reabrir la vuelve editable **y queda en la auditoría** | `grid.int-spec` «reabrir la devuelve a editable, y DEJA RASTRO EN LA AUDITORÍA» y «reabierta, la grilla vuelve a admitir cambios» |

## HU-052-04 — Quién no llegó

| Criterio | Dónde se prueba |
|---|---|
| Marcar deja `no_show` y vacía sus celdas de una vez | `grid.int-spec` «marcar ausente vacía TODAS sus celdas de una vez» · `grilla.spec.tsx` «marcar ausente manda la persona y la bandera» |
| Estando marcado no se le puede poner en una celda | `grid.int-spec` «estando marcado NO se le puede poner en una celda: la otra dirección de la invariante» · `grilla.spec.tsx` «un ausente no se puede tocar en la grilla» |
| Desmarcar lo devuelve a aceptado y **no** restaura celdas | `grid.int-spec` «desmarcar lo devuelve a aceptado, y NO le restaura las celdas» y «desmarcado, se le puede volver a poner en la grilla» |
| Quien no estaba aceptado no se marca | `grid.int-spec` «alguien que NO estaba aceptado no se puede marcar» |

## HU-052-05 — Cómo terminó

**Aplazada** con T-726, el 2026-08-27. Es la única parte del módulo que el hito del MVP no necesita,
y R-052-09 ya dice que el resultado no le cambia nada a nadie. `practice_result` existe con su
migración y sus tests de esquema —`grid-schema.int-spec` «una práctica tiene UN resultado, no dos»—
así que retomarla es escribir una ruta, no rehacer nada.

Que cerrar **sin** marcador funcione ya está probado: todos los tests de cierre lo hacen sin él.

## HU-052-06 — Cuántos chukkers jugué

| Criterio | Dónde se prueba |
|---|---|
| Veo mi fila y mi cuenta | `grilla.spec.tsx` «muestra la cuenta de cada quien, que es lo que se mira antes de cerrar» · E2E «el jugador ve su cuenta» |
| Una práctica de otro club responde 404, nunca 403 | `grid.int-spec` «el comisario de OTRO club recibe 404, nunca 403 (P-05)» y «el comisario de OTRO club tampoco corrige la grilla ajena» |

## Reglas transversales

| Regla | Dónde se prueba |
|---|---|
| R-052-02 la cuenta se cuenta de las celdas y de ningún otro lado | `grid.spec` (6 tests de `chukkersPorPersona`) · `grid.int-spec` «la cuenta por persona viaja calculada» |
| R-052-04 en la **base**, no en el código | `grid-schema.int-spec` «la misma persona NO puede jugar dos veces el mismo chukker» y «varios HUECOS en el mismo chukker sí se aceptan» |
| R-052-05 en una celda va cualquier persona activa del club | `grid.int-spec` «se puede meter a alguien que NO se postuló» y «una persona de OTRO club se rechaza» |
| R-052-07 contra el reloj inyectado (P-08) | `grid.spec` «NO mira el reloj del sistema: la misma práctica da distinto según la hora que se le pase» |
| El presupuesto de la interfaz | `grid.int-spec` «el listado de prácticas NO trae celdas, ni una» · `pnpm check:bundle` en 126,1 KB de 200 |
| Aislamiento | arnés con las **cinco** rutas, todas con test propio |
| La semilla deja el sistema en el estado que el E2E supone | `seed.int-spec` (5 tests de las tres prácticas) |

## Lo que se descubrió construyendo, y no estaba en el plan

1. **El spec se contradecía a sí mismo.** HU-052-04 pedía que marcar ausente vaciara las celdas de
   una vez **y** que se rechazara marcar a quien tuviera celdas. Con la grilla naciendo llena, todos
   tienen celdas desde el primer segundo: la segunda regla habría hecho imposible marcar a nadie,
   que es lo contrario de la conveniencia que la historia promete. Se corrigió el spec y la
   invariante quedó en la otra dirección.
2. **Yo mismo dejé un callejón sin salida.** El mensaje de error de T-723 decía «quita la marca
   antes de ponerla en la grilla», y no había con qué quitarla. Desmarcar existe ahora, y **no**
   restaura las celdas: el sistema no sabe qué chukkers jugó.
3. **Aprobar equipos no era terminal, y eso cambió una llave foránea.** El plan daba por hecho que
   sí. `051` permite aprobar de nuevo y volver a proponer hace `deleteMany` sobre los equipos: una
   celda con llave foránea a `practice_team` se habría ido **por cascada, en silencio**, la primera
   vez que un comisario rearmara. La celda guarda el equipo como coordenada.
4. **Un test de aislamiento daba verde sin probar nada.** El arnés obliga a declarar cada ruta nueva
   y falló hasta hacerlo; pero meterlas en el recorrido genérico las daba por buenas: el recorrido
   no crea una práctica del club víctima ni sustituye `:id` para prácticas, así que la URL llegaba
   con `:id` literal y el 404 salía por inexistente. Las cinco pasaron a tener test propio.
5. **Una mutación no disparó, y eso enseñó dónde estaba la red.** Para verificar que la grilla no se
   cuela en los listados la añadí al `include` de Prisma y el test siguió verde: el servicio mapea a
   un DTO explícito. La filtración real sólo entra por el DTO, y ahí sí cae.
6. **Los once códigos de error nuevos no tenían texto en español.** El cliente traduce por código y
   **nunca** muestra el `message` del servidor (T-122), así que todos habrían salido como el error
   genérico. Lo destapó el aviso de consola que existe justo para esto.
7. **El error de cerrar se leía de otra instancia del hook** que la que corría la mutación, así que
   el motivo del servidor no aparecía nunca. Lo encontró el test, no yo.
8. **El guardián de la semilla tapaba las tres prácticas.** Estaba sobre el bloque entero: en una
   base ya sembrada, las prácticas nuevas no aparecían nunca, y el síntoma habría sido un E2E que
   falla en local y pasa en CI. Ahora cada práctica comprueba su propia franja.
9. **Prisma volvió a generar el `DROP DEFAULT` sobre una columna GENERATED**, por quinta vez.

Todos se verificaron **rompiendo a propósito** lo que decían proteger: las cuatro funciones del
dominio, las dos pasadas del lote, el vaciado de celdas, el `puedeCerrar`, el congelado, la
transacción única de la aprobación, y las dos garantías de la pantalla. Un test que pasa igual con y
sin la garantía que dice probar es peor que no tenerlo.

## Pendientes declarados

- **El marcador (`PUT /practices/:id/result`)** está aplazado, no descartado. Ver T-726.
- **`chukker_grid_cell.horse_id` está declarada y sin usar** hasta `090` (caballos), con el criterio
  de `practice_slot.cost_share_primary_pct`.
- **Tras un rearme, la grilla puede tener a alguien que ya no está en ningún equipo.** No es una
  inconsistencia: los equipos dicen quién iba a jugar y la grilla dice quién jugó, y R-052-05 ya
  permite en una celda a cualquier persona activa del club.
- **Cerrar no exige una grilla completa** (R-052-10). Un chukker vacío es un dato posible —se cortó
  por lluvia— y exigirla obligaría a inventar celdas para poder cerrar.
- **Un fallo intermitente de `handicaps.spec.ts`** apareció una vez bajo carga. No es de este
  módulo; queda como trabajo aparte.
