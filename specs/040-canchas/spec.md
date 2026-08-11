# SPEC-040 — Canchas y calendario

> Estado: ready · Depende de: 010, 020 · Fuente: `docs/source` §6, `docs/02` §D, `docs/08` §5,
> `docs/09` Q-09, decisiones de Daniel del 2026-08-11 (§13)

Primer módulo de la Fase 2 (`docs/roadmap.md`). Junto con 050 forma el **corte mínimo utilizable**:
el club deja de coordinar por WhatsApp cuando puede ver, en un solo lugar, qué hay programado en
cada cancha y cuándo.

No es un módulo grande, pero sí el que sostiene a los siguientes: prácticas, clases, copas y
taqueos **ocupan una cancha en un rango de tiempo**, y todos van a apoyarse en la misma garantía de
que dos cosas no pueden estar en el mismo lugar a la misma hora.

## 1. Problema

Hoy el club tiene tres canchas y ninguna forma de saber qué pasa en ellas. La ocupación vive en la
cabeza de dos o tres personas y en mensajes de WhatsApp que hay que ir a buscar. Las consecuencias
son concretas y ocurren:

- **Se programan dos cosas a la misma hora en la misma cancha.** Alguien se entera cuando llega.
- **Se riega una cancha con una práctica programada encima**, porque quien riega no sabía.
- **Nadie puede responder «¿está libre la 2 el jueves a las 4?»** sin preguntarle a alguien.

Y hay un problema más silencioso: **el calendario, mal hecho, filtra información de terceros.** Ver
que «María toma clase los martes a las 7» no es asunto de nadie más, y un calendario ingenuo lo
publica sin querer.

## 2. Resultado esperado

Un calendario por cancha y por día donde el club ve qué hay programado, puede bloquear una cancha
por mantenimiento o riego, y **el sistema hace imposible** que dos actividades ocupen la misma
cancha al mismo tiempo — no difícil: imposible, garantizado por la base de datos.

Y una regla de privacidad que se cumple sola: quien mira ve el detalle de lo suyo y de lo público
del club, y de todo lo demás ve «Ocupado».

## 3. Fuera de alcance (en esta versión)

- **Taqueos.** Necesitan reserva con cobro y tarifa por categoría (`docs/09` Q-09), y el módulo de
  pagos es Fase 3. Construirlos ahora obliga a inventar un cobro de mentira que habría que borrar.
  El tipo de reserva ya queda previsto; lo que falta es quién lo crea y quién lo paga.
- **Prácticas, clases y copas.** Son 050, 070 y 060. Este módulo les da dónde apoyarse.
- **Cierre de jornada por lluvia.** Es política de cancelación (110): aquí sólo existe el bloqueo
  administrativo, que es otra cosa —el bloqueo impide programar, la cancelación deshace lo ya
  programado y decide qué pasa con la plata.
- **Vista de semana y de mes.** La primera versión es por día, que es como se opera. Se agregan
  cuando haya suficientes eventos para que valgan algo.

## 4. Actores

| Actor | Qué hace aquí |
|---|---|
| `club_admin` | crea y edita canchas, las pone fuera de servicio, bloquea franjas |
| `commissioner` | bloquea franjas por condiciones de juego; no administra canchas |
| Cualquiera con sesión | ve el calendario, con la privacidad de R-040-07 |

## 5. Historias de usuario

### HU-040-01 — Las canchas del club existen
**Como** administrador **quiero** registrar las canchas del club **para** que todo lo que se
programe tenga dónde ocurrir.

- **Dado** un club recién creado, **cuando** el administrador entra a canchas, **entonces** ve las
  que se crearon con el club y puede agregar, renombrar o describir cada una.
- **Dado** una cancha que se está reparando, **cuando** el administrador la marca fuera de servicio,
  **entonces** deja de poder programarse y el calendario lo muestra, pero **lo ya programado no
  desaparece** — se ve, y el administrador decide qué hacer con cada cosa.
- **Dado** una cancha con historia, **cuando** el administrador intenta eliminarla, **entonces** no
  puede: se archiva (P-06). Borrarla dejaría prácticas del año pasado apuntando a la nada.

### HU-040-02 — Nada se programa encima de otra cosa
**Como** club **quiero** que sea imposible ocupar dos veces la misma cancha a la misma hora
**para** que nadie llegue a jugar y se encuentre con que la cancha está tomada.

- **Dado** una cancha con algo programado de 4:00 a 5:30, **cuando** alguien intenta programar algo
  que **se solape** aunque sea un minuto, **entonces** el sistema lo rechaza y dice con qué choca.
- **Dado** dos administradores guardando **al mismo tiempo** dos actividades que se solapan,
  **cuando** ambos confirman, **entonces** una entra y la otra recibe el mismo error — no quedan
  las dos.
- **Dado** una actividad cancelada, **cuando** alguien programa otra cosa en esa franja,
  **entonces** puede: lo cancelado no ocupa.

### HU-040-03 — Bloquear una cancha por mantenimiento o riego
**Como** administrador o comisario **quiero** bloquear una cancha en una franja **para** que nadie
programe nada mientras se riega o se repara.

- **Dado** una franja libre, **cuando** se bloquea con un motivo, **entonces** ocupa la cancha
  igual que cualquier otra actividad y nada más puede programarse ahí.
- **Dado** una franja con algo ya programado, **cuando** se intenta bloquear, **entonces** el
  sistema lo rechaza diciendo con qué choca. El bloqueo no atropella lo que ya existe: si hay que
  cancelar la práctica, eso se decide y se hace explícitamente.
- **Dado** un bloqueo que ya no aplica, **cuando** se levanta, **entonces** la franja vuelve a estar
  disponible de inmediato.

### HU-040-04 — Ver qué hay en las canchas
**Como** cualquier persona del club **quiero** ver el calendario del día **para** saber qué hay
programado y qué está libre.

- **Dado** un día cualquiera, **cuando** alguien lo abre, **entonces** ve las tres canchas con lo
  que hay en cada una y las franjas libres.
- **Dado** un evento en el que la persona participa, **cuando** lo mira, **entonces** ve el detalle.
- **Dado** un evento privado de otra persona, **cuando** lo mira, **entonces** ve **«Ocupado»** con
  su horario y su cancha, y nada más: ni el tipo, ni el nombre, ni un identificador.

### HU-040-05 — El club opera dentro de un horario
**Como** club **quiero** que no se programe nada de madrugada **para** que el calendario refleje
cuándo se puede jugar de verdad.

- **Dado** que las canchas **no tienen iluminación**, **cuando** alguien intenta programar algo
  fuera del horario de operación del club, **entonces** el sistema lo rechaza.
- **Dado** que el horario lo define cada club, **cuando** cambia, **entonces** cambia sin desplegar
  nada (P-04).

## 6. Reglas de negocio

- `R-040-01` Toda ocupación de una cancha —de cualquier tipo— se registra en **una sola tabla**
  (`field_booking`). Si cada módulo llevara su propia agenda, la garantía de no solapamiento
  tendría que reimplementarse en cada uno, y con eso desaparecería.
- `R-040-02` **Dos reservas vigentes de la misma cancha no pueden solaparse.** Lo garantiza la base
  de datos con una restricción de exclusión (`EXCLUDE USING gist`), no la aplicación. Es la razón
  por la que se eligió PostgreSQL (`docs/02` §D).
- `R-040-03` Una reserva cancelada **no ocupa**. La restricción aplica sólo a las vigentes.
- `R-040-04` El rango de tiempo es **semiabierto**: `[inicio, fin)`. Una actividad que termina a las
  5:30 y otra que empieza a las 5:30 **no** se solapan. Sin esta convención, cada módulo decidiría
  por su cuenta y en algún borde aparecerían choques o huecos falsos.
- `R-040-05` Los instantes se persisten en UTC y se muestran en la zona del club (regla de oro 9).
  El calendario de un día se resuelve contra la zona del club, no la del navegador: un martes en
  Bogotá tiene que ser el mismo martes para quien mira desde otro país.
- `R-040-06` No se programa fuera del horario de operación del club, que es configuración
  (`field.operating_hours`), ni en una cancha fuera de servicio.
- `R-040-07` **El calendario no revela eventos privados de terceros.** Quien consulta ve el detalle
  sólo si participa del evento, lo creó, o el evento es público (prácticas y copas del club). En
  cualquier otro caso recibe únicamente cancha, inicio y fin, con la etiqueta «Ocupado» — sin tipo,
  sin identificadores, sin nombres.
- `R-040-08` Una cancha **se archiva, no se borra** (P-06). Lo programado en ella conserva su
  historia.
- `R-040-09` Toda reserva pertenece a un club y el acceso se filtra por tenant (P-05). Una cancha
  de otro club responde `404`.

## 7. Datos

Lo que define `docs/02` §D, sin cambios:

- **`field`** — `club_id`, `name`, `surface`, `status` (`active` | `maintenance` | `archived`),
  `capacity_notes`.
- **`field_booking`** — `club_id`, `field_id`, `time_range tstzrange`, `booking_type`, `source_id`,
  `visibility` (`public` | `private`), `created_by_id`, `cancelled_at`, `reason`.

```sql
ALTER TABLE field_booking
  ADD CONSTRAINT no_field_overlap
  EXCLUDE USING gist (field_id WITH =, time_range WITH &&)
  WHERE (cancelled_at IS NULL);
```

`booking_type` incluye desde ya `stick_and_ball` aunque los taqueos estén fuera de alcance: el
vocabulario es del dominio, no de lo que esté implementado esta semana.

## 8. Interfaz

- `GET /fields` — las canchas del club.
- `POST /fields`, `PATCH /fields/:id`, `POST /fields/:id/archive` — administración (`club.edit`).
- `GET /calendar?date=YYYY-MM-DD` — el día, por cancha, **ya filtrado por privacidad**.
- `POST /field-bookings/block` — bloquear una franja (`club.edit` o comisario).
- `DELETE /field-bookings/:id` — levantar un bloqueo o cancelar una reserva propia.

El filtrado de privacidad ocurre **en el servidor**. Mandar el calendario completo y esconder en el
navegador es publicar los datos: están en la respuesta, y el navegador es de quien mira.

## 9. Dominio puro

En `packages/domain/scheduling`, sin base de datos ni reloj del sistema:

- `seSolapan(a, b)` — con la convención semiabierta de R-040-04. Es una función de tres líneas y
  merece existir aparte: es la regla que todos los módulos siguientes van a preguntar, y tenerla en
  un solo lugar es lo que evita que cada uno resuelva el borde a su manera.
- `cabeEnElHorario(rango, horario)` — R-040-06.
- `puedeVerElDetalle(evento, quienMira)` — R-040-07, la regla de privacidad como función pura, para
  poder probar los seis casos sin levantar nada.

## 10. Pantallas

- **Calendario del día** — tres columnas, una por cancha; los eventos con su horario; lo ajeno y
  privado como «Ocupado». Mobile-first: en un celular es una cancha a la vez, deslizable.
- **Canchas (admin)** — lista, crear, editar, poner fuera de servicio, archivar.
- **Bloquear una franja** — desde el calendario, sobre una franja libre.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| El error de la restricción de exclusión (`23P01`) llega crudo al usuario | se traduce a un error de contrato legible que dice **con qué** choca; hay test |
| La privacidad se filtra por un campo que alguien agrega después a la respuesta | el test serializa la respuesta completa y falla si aparece cualquier identificador ajeno |
| El día del calendario se calcula con la zona del navegador | el día se resuelve contra la zona del club; hay test con dos zonas distintas |
| El bloqueo de riego se usa para tapar una práctica que había que cancelar | el bloqueo **no puede** crearse sobre algo existente: obliga a cancelar explícitamente |

## 12. Definición de terminado

- Restricción de exclusión probada **con dos escrituras concurrentes**, no sólo secuenciales.
- Test de privacidad que serializa la respuesta y verifica que no aparece ningún identificador de
  terceros.
- Test del borde de R-040-04: 5:30–7:00 después de 4:00–5:30 **no** choca.
- Aislamiento de tenant registrado en el arnés para cada ruta nueva.
- `verification.md` con cada criterio de aceptación mapeado a su test.

## 13. Decisiones tomadas (2026-08-11)

| Pregunta | Decisión | Consecuencia |
|---|---|---|
| ¿Franjas fijas o horarios libres? | **Horarios libres**, de tal hora a tal hora | `tstzrange` con restricción de exclusión, no una tabla de turnos. Permite una clase de 45 minutos y una copa de cuatro horas sin casos especiales |
| ¿Las canchas tienen luz? | **No, sólo luz natural** | El horario de operación es del club y no de cada cancha: una sola clave de configuración, `field.operating_hours` |
| ¿Los taqueos entran aquí? | **No, van con pagos (Fase 3)** | `booking_type` los prevé; falta quién los crea y quién los cobra |

## 14. Supuestos

- `[SUPUESTO]` El horario de operación por defecto es **6:00 a.m. a 6:00 p.m.**, configurable por
  club. Sale de «sólo luz natural» en Bogotá, que está cerca del ecuador y varía poco en el año. Si
  el club opera distinto, se cambia sin desplegar.
- `[SUPUESTO]` Las tres canchas se crean junto con el club, como ya ocurre con las categorías de
  membresía (`docs/08` §5, `field.count = 3`). El administrador las renombra si quiere.
- `[SUPUESTO]` Un bloqueo de mantenimiento es **público**: que la cancha 2 esté en riego no es
  información de nadie en particular, y esconderlo haría que la gente pregunte por qué no puede
  programar.
- `[SUPUESTO]` El comisario puede bloquear por condiciones de juego —cancha impracticable— pero no
  administra canchas. Sale de su rol en `docs/06` §4: autoridad deportiva, no administrativa.
