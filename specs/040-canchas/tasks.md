# TASKS-040 — Canchas y calendario

> Cada tarea: una sesión, un commit (`docs/10` §2).
> Si una tarea, al hacerla, resulta tocar más de 5 archivos o 400 líneas de diff: detente y avisa —
> la tarea estaba mal partida. Pasó tres veces en `specs/010` y las tres veces quedó mejor partida.

**Numeración `T-4XX`.** Los mensajes de commit citan la tarea por su número, y dos módulos con
`T-021` harían ambiguo el historial.

**El orden no es negociable en un punto**: el dominio puro va antes que el API. `seSolapan` y
`puedeVerElDetalle` son las dos reglas que todo lo demás consulta, y escribirlas primero obliga a
decidir los bordes —el minuto exacto, el caso sin sesión— antes de que haya una pantalla presionando
por salir.

## A — Esquema y migraciones

- [ ] **T-401** Modelos `Field` y `FieldBooking` (`plan.md` §1), con el SQL a mano que Prisma no
  sabe expresar: `CREATE EXTENSION btree_gist`, la columna **generada** `time_range`, la restricción
  de exclusión `no_field_overlap` y el `CHECK` de `ends_at > starts_at`.
  Verificación: cada invariante probado **provocando su rechazo**, no asumiéndolo. Los cinco casos
  ya comprobados a mano en `plan.md` §1 se convierten en tests de integración: el borde de las 5:30
  entra, un solape de un minuto falla, otra cancha a la misma hora entra, una reserva cancelada no
  ocupa, y escribir `time_range` a mano es imposible. Migración `up` y `down` contra Postgres real.
  > El `down.sql` **no borra la extensión**: puede estar en uso por otra cosa —`specs/020` ya la usa
  > para las temporadas— y quitarla es más peligroso que dejarla.

- [ ] **T-402** Las tres canchas nacen con el club: agregarlas a `crearClubCompleto`
  (`specs/020`) y a `pnpm db:seed`, tomando la cantidad de `field.count` (`docs/08` §5).
  Verificación: un club recién creado por `POST /platform/clubs` ya tiene sus canchas; correr el
  seed dos veces no las duplica.

## B — Dominio puro (antes que el API, a propósito)

- [ ] **T-410** `seSolapan(a, b)` en `packages/domain/scheduling`, con la convención semiabierta de
  R-040-04.
  Verificación: los bordes exactos. `[4:00, 5:30)` y `[5:30, 7:00)` **no** se solapan; `[4:00, 5:30)`
  y `[5:29, 6:00)` sí; rangos idénticos sí; uno contenido en otro sí; rangos de duración cero
  —que la base ya rechaza— documentados como imposibles aquí también.
  > Son tres líneas y merece existir aparte: es la regla que 050, 060 y 070 van a preguntar, y
  > tenerla en un solo lugar es lo que evita que cada uno resuelva el borde a su manera.

- [ ] **T-411** `cabeEnElHorario(rango, horario)` — R-040-06, con el horario como parámetro y no
  como constante (P-04).
  Verificación: dentro entra; empezar antes de la apertura no; terminar después del cierre no;
  exactamente en el borde de apertura y de cierre **sí** entra.

- [ ] **T-412** `puedeVerElDetalle(evento, quienMira)` — R-040-07 como función pura.
  Verificación: los seis casos, cada uno con su nombre en español — participante, creador, evento
  público, evento privado ajeno, evento público ajeno, y **sin sesión**. El caso «sin sesión» existe
  porque `GET /calendar` va a estar detrás del guard hoy, y el día que alguien lo abra al público la
  regla ya está decidida y probada.

## C — El servicio de reservas, que es el que van a usar los demás módulos

- [ ] **T-420** `bookings.service`: `reservar(...)` y `cancelar(...)`, **recibiendo la transacción**
  (`plan.md` §2). Es el único lugar del sistema que escribe `field_booking`.
  Verificación: crear una reserva dentro de una transacción que después se revierte **no deja
  nada**; cancelar libera la franja de inmediato; una cancha de otro club responde `404`.

- [ ] **T-421** `overlap-error.ts`: traducir el `23P01` de PostgreSQL a un error de contrato que
  **diga con qué choca**, no sólo que chocó.
  Verificación: se provoca el choque de verdad —dos inserciones reales— y se comprueba el código de
  error y que el mensaje nombre la franja ocupada. Un `500` con «conflicting key value violates
  exclusion constraint» es un error que el usuario no puede entender ni resolver.

- [ ] **T-422** Test de **concurrencia real**: dos transacciones abiertas a la vez intentando
  reservar franjas que se solapan, y confirmar las dos.
  Verificación: entra una y la otra recibe el error de solapamiento. **Dos inserciones en secuencia
  no prueban esto** — pasarían igual sin la restricción, porque la segunda vería a la primera.

## D — Canchas

- [ ] **T-430** `GET /fields` y `POST /fields` con permiso `field.edit` (`plan.md` §4).
  Verificación: contrato de entrada y salida; un jugador puede listar pero no crear; dos canchas del
  mismo club no se llaman igual; el mismo nombre sí se repite en otro club (P-05).

- [ ] **T-431** `PATCH /fields/:id` y `POST /fields/:id/archive`.
  Verificación: archivar **no borra** y lo ya programado sigue existiendo (R-040-08); una cancha
  archivada o en mantenimiento no admite reservas nuevas; una cancha de otro club responde `404`,
  nunca `403`.

## E — Bloqueos

- [ ] **T-440** `POST /field-bookings/block` con permiso `field.block` (administrador o comisario).
  Verificación: bloquear una franja libre la ocupa como cualquier otra actividad; **bloquear encima
  de algo existente se rechaza** diciendo con qué choca (HU-040-03) — el bloqueo no atropella lo
  programado; el motivo es obligatorio.

- [ ] **T-441** `DELETE /field-bookings/:id` para levantar un bloqueo.
  Verificación: la franja queda disponible de inmediato; un jugador no levanta el bloqueo de otro;
  cancelar dos veces no falla.

## F — El calendario

- [ ] **T-450** `GET /calendar?date=` — el día por cancha, resuelto **contra la zona del club**
  (`plan.md` §5).
  Verificación: el mismo día devuelve lo mismo consultado desde dos zonas horarias distintas; una
  actividad de las 7:00 p.m. en Bogotá aparece en **ese** día y no en el siguiente; un día sin nada
  devuelve las canchas con sus franjas vacías, no una lista vacía sin contexto.

- [ ] **T-451** La privacidad aplicada en el servicio (R-040-07), con el contrato de unión
  discriminada.
  Verificación: **el test serializa la respuesta completa** y falla si aparece cualquier
  identificador de un evento ajeno y privado — no basta con comprobar que el campo `type` viene
  vacío. Los seis casos de T-412, ahora de punta a punta.
  > Es el test que protege la promesa del spec: nadie debe poder deducir del calendario quién toma
  > clases o taquea a cierta hora.

- [ ] **T-452** Registrar las rutas nuevas en el arnés de aislamiento de tenant.
  Verificación: `pnpm check:isolation` en verde con las cinco rutas declaradas.

## G — Pantallas

- [ ] **T-460** **Calendario del día** (`/calendar`): tres columnas, una por cancha; lo ajeno y
  privado como «Ocupado». Mobile-first: en un celular es una cancha a la vez, deslizable.
  Verificación: tests de componente con las dos formas del contrato; que «Ocupado» **no renderice**
  ningún dato del evento aunque llegara por error en la respuesta.

- [ ] **T-461** **Canchas** (`/fields`): lista, crear, editar, archivar. Acceso desde el panel para
  quien administra.
  Verificación: el formulario no ofrece archivar una cancha ya archivada; el error de nombre
  repetido se muestra con el texto del club, no con el del servidor.

- [ ] **T-462** **Bloquear una franja** desde el calendario, sobre una franja libre.
  Verificación: el choque con algo existente se muestra diciendo con qué choca; el motivo es
  obligatorio en el formulario, no sólo en el API.

## H — Cierre

- [ ] **T-470** E2E de navegador: el administrador bloquea una franja por riego, el calendario lo
  muestra, e intentar programar encima falla con un mensaje entendible.
- [ ] **T-471** `verification.md` con cada criterio de aceptación de `spec.md` mapeado a su test.
  Cualquier criterio sin test identificado se resuelve **antes** de dar el módulo por terminado.
  > En `specs/010` esta tarea destapó cuatro criterios que no estaban implementados, no sin probar.
  > No es papeleo.
