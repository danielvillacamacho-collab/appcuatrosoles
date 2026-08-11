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

- [x] **T-401** Modelos `Field` y `FieldBooking` (`plan.md` §1), con el SQL a mano que Prisma no
  sabe expresar: `CREATE EXTENSION btree_gist`, la columna **generada** `time_range`, la restricción
  de exclusión `no_field_overlap` y el `CHECK` de `ends_at > starts_at`.
  Verificación: cada invariante probado **provocando su rechazo**, no asumiéndolo. Los cinco casos
  ya comprobados a mano en `plan.md` §1 se convierten en tests de integración: el borde de las 5:30
  entra, un solape de un minuto falla, otra cancha a la misma hora entra, una reserva cancelada no
  ocupa, y escribir `time_range` a mano es imposible. Migración `up` y `down` contra Postgres real.
  > El `down.sql` **no borra la extensión**: puede estar en uso por otra cosa —`specs/020` ya la usa
  > para las temporadas— y quitarla es más peligroso que dejarla.
  ✅ 2026-08-11 — 11 tests de integración. Ciclo `up`/`down`/`up` verificado contra Postgres real, y
  la extensión sigue en pie después del `down`.
  > Los tests **no pasan por la aplicación**: van directo a la base, porque lo que se prueba es que
  > la **base** impide el solapamiento. Probándolo contra un servicio, el día que alguien cambie el
  > servicio el test seguiría pasando y la garantía se habría ido sin que nadie lo notara.

- [x] **T-402** Las tres canchas nacen con el club: agregarlas a `crearClubCompleto`
  (`specs/020`) y a `pnpm db:seed`, tomando la cantidad de `field.count` (`docs/08` §5).
  Verificación: un club recién creado por `POST /platform/clubs` ya tiene sus canchas; correr el
  seed dos veces no las duplica.
  ✅ 2026-08-11 — 2 tests. **Cierra la sección A.**
  > Se numeran («Cancha 1», «Cancha 2», «Cancha 3») porque es como las llama el club al hablar. Un
  > nombre inventado —«Principal», «Norte»— obligaría a renombrarlas el primer día.
  > La cantidad sale de `field.count` del catálogo y no de un literal: un club con dos canchas o con
  > cinco no debería necesitar un despliegue (P-04).

## B — Dominio puro (antes que el API, a propósito)

- [x] **T-410** `seSolapan(a, b)` en `packages/domain/scheduling`, con la convención semiabierta de
  R-040-04.
  Verificación: los bordes exactos. `[4:00, 5:30)` y `[5:30, 7:00)` **no** se solapan; `[4:00, 5:30)`
  y `[5:29, 6:00)` sí; rangos idénticos sí; uno contenido en otro sí; rangos de duración cero
  —que la base ya rechaza— documentados como imposibles aquí también.
  > Son tres líneas y merece existir aparte: es la regla que 050, 060 y 070 van a preguntar, y
  > tenerla en un solo lugar es lo que evita que cada uno resuelva el borde a su manera.
  ✅ 2026-08-11 — 10 tests. **Y el caso del rango vacío estaba mal**: `a.inicio < b.fin && b.inicio
  < a.fin` responde `true` para un rango de duración cero contenido en otro. El test lo atrapó, y
  `SELECT tstzrange(x,x) && …` en PostgreSQL confirmó que la base responde `false`. Sin tratarlo
  aparte, la aplicación y la base discrepaban **justo donde el comentario prometía que no**.

- [x] **T-411** `cabeEnElHorario(rango, horario)` — R-040-06, con el horario como parámetro y no
  como constante (P-04).
  Verificación: dentro entra; empezar antes de la apertura no; terminar después del cierre no;
  exactamente en el borde de apertura y de cierre **sí** entra.
  ✅ 2026-08-11 — 17 tests. Devuelve el motivo y no un booleano: «el club abre a las 6:00» y «el
  club cierra a las 18:00» son mensajes distintos, y con un booleano quien llama tendría que
  recalcular cuál fue.
  > **La zona horaria entra como parámetro**, y hay un test que compara el mismo instante contra dos
  > clubes en husos distintos. Con `getHours()` una práctica de las 4:00 p.m. en Bogotá se leería
  > como las 9:00 p.m. — y el fallo aparecería sólo en producción, donde el servidor corre en UTC.
  > `leerHorario` valida el formato en vez de confiar: `"6-18"` produce `NaN` y comparaciones que
  > **siempre dan falso**, así que el club no podría programar nada y nada en pantalla lo explicaría.

- [x] **T-412** `puedeVerElDetalle(evento, quienMira)` — R-040-07 como función pura.
  Verificación: los seis casos, cada uno con su nombre en español — participante, creador, evento
  público, evento privado ajeno, evento público ajeno, y **sin sesión**. El caso «sin sesión» existe
  porque `GET /calendar` va a estar detrás del guard hoy, y el día que alguien lo abra al público la
  regla ya está decidida y probada.
  ✅ 2026-08-11 — 8 tests. **Cierra la sección B**, con `scheduling` al 100 % de líneas y ramas.
  > A la función entra lo mínimo para decidir: visibilidad y quién lo creó. No sabe de qué tipo es
  > el evento ni a qué práctica pertenece — cuanto menos entra, menos puede filtrarse por descuido.
  > Un test comprueba que **ser del mismo club no alcanza**: si pertenecer bastara, el calendario
  > publicaría las clases particulares de todo el mundo entre sí.

## C — El servicio de reservas, que es el que van a usar los demás módulos

- [x] **T-420** `bookings.service`: `reservar(...)` y `cancelar(...)`, **recibiendo la transacción**
  (`plan.md` §2). Es el único lugar del sistema que escribe `field_booking`.
  Verificación: crear una reserva dentro de una transacción que después se revierte **no deja
  nada**; cancelar libera la franja de inmediato; una cancha de otro club responde `404`.
  ✅ 2026-08-11 — 15 tests entre T-420, T-421 y T-422. El servicio es global, como `WaiversService`:
  que haya que importarlo es lo que empuja a alguien a insertar por su cuenta.
  > Valida además lo que la base no puede: cancha **activa** —una en mantenimiento no admite
  > reservas— y horario de operación, con el motivo exacto del rechazo.

- [x] **T-421** `overlap-error.ts`: traducir el `23P01` de PostgreSQL a un error de contrato que
  **diga con qué choca**, no sólo que chocó.
  Verificación: se provoca el choque de verdad —dos inserciones reales— y se comprueba el código de
  error y que el mensaje nombre la franja ocupada. Un `500` con «conflicting key value violates
  exclusion constraint» es un error que el usuario no puede entender ni resolver.
  ✅ 2026-08-11 — **Prisma no le da clase propia a este error**: llega como
  `PrismaClientUnknownRequestError`, sin `code` y sin `meta` — se comprobó imprimiendo el error
  real. Lo único que queda del fallo de PostgreSQL es el texto anidado, que sí trae `23P01` y el
  nombre de la restricción. Se exigen los dos: el código solo aparecería también en el `EXCLUDE` de
  temporadas de `specs/020`, y traducir aquél a «esa cancha ya está ocupada» sería mentir.
  > La consulta de «con qué choca» va **fuera** de la transacción: la violación ya la abortó, y
  > cualquier consulta dentro fallaría con «current transaction is aborted».
  > La zona horaria del mensaje entra como parámetro. Estaba escrita como `"America/Bogota"` fijo
  > con una justificación que era una racionalización — el servicio ya conoce el club.

- [x] **T-422** Test de **concurrencia real**: dos transacciones abiertas a la vez intentando
  reservar franjas que se solapan, y confirmar las dos.
  Verificación: entra una y la otra recibe el error de solapamiento. **Dos inserciones en secuencia
  no prueban esto** — pasarían igual sin la restricción, porque la segunda vería a la primera.
  ✅ 2026-08-11 — **Cierra la sección C.** Y se verificó que el test prueba lo que dice: se corrió
  el mismo escenario **quitando la restricción** en la base de prueba, y las dos transacciones
  entraron dejando dos reservas solapadas. Con la restricción, la segunda falla y queda una.
  > Un test que pasa igual con y sin la garantía que dice probar es peor que no tenerlo: da
  > confianza sin avisar de nada. Comprobarlo cuesta cinco minutos.

## D — Canchas

- [x] **T-430** `GET /fields` y `POST /fields` con permiso `field.edit` (`plan.md` §4).
  Verificación: contrato de entrada y salida; un jugador puede listar pero no crear; dos canchas del
  mismo club no se llaman igual; el mismo nombre sí se repite en otro club (P-05).
  ✅ 2026-08-11 — 18 tests entre las cuatro tareas. **Listar no exige permiso administrativo, sólo
  sesión**: saber qué canchas hay es lo mínimo para leer el calendario.
  > El nombre repetido lo decide el índice único, no una comprobación previa: dos administradores
  > creando «Cancha 4» a la vez pasarían los dos un `findFirst`. La base decide y el servicio
  > traduce.

- [x] **T-431** `PATCH /fields/:id` y `POST /fields/:id/archive`.
  Verificación: archivar **no borra** y lo ya programado sigue existiendo (R-040-08); una cancha
  archivada o en mantenimiento no admite reservas nuevas; una cancha de otro club responde `404`,
  nunca `403`.
  > **El contrato no deja archivar por la puerta de atrás**: `PATCH` admite `active` y
  > `maintenance`, no `archived`. Archivar tiene su propia ruta y su propio registro de auditoría;
  > colarlo como un cambio de campo lo haría parecer reversible y trivial, y es lo contrario.
  > Una cancha archivada **no se lista** pero se puede pedir: quien mira el calendario de marzo
  > necesita saber en qué cancha fue esa práctica.

## E — Bloqueos

- [x] **T-440** `POST /field-bookings/block` con permiso `field.block` (administrador o comisario).
  Verificación: bloquear una franja libre la ocupa como cualquier otra actividad; **bloquear encima
  de algo existente se rechaza** diciendo con qué choca (HU-040-03) — el bloqueo no atropella lo
  programado; el motivo es obligatorio.
  > **`field.block` es un permiso aparte de `field.edit`**, y el comisario tiene sólo el primero: su
  > autoridad es deportiva —la cancha está impracticable— no administrativa (`docs/06` §4). Con un
  > permiso único, dárselo le habría dado también renombrar y archivar canchas. Hay dos tests de
  > dominio nuevos que fijan que puede bloquear **y nada más**.
  > El bloqueo pasa por el mismo `BookingsService` que todo lo demás: ocupa igual y choca igual.

- [x] **T-441** `DELETE /field-bookings/:id` para levantar un bloqueo.
  Verificación: la franja queda disponible de inmediato; un jugador no levanta el bloqueo de otro;
  cancelar dos veces no falla.
  ✅ 2026-08-11 — **Cierran las secciones D y E.** Las cinco rutas quedaron declaradas en el arnés
  de aislamiento (adelanta T-452); las cuatro de canchas entran al recorrido genérico y las dos de
  bloqueo llevan test propio, porque necesitan un cuerpo con fechas coherentes dentro del horario
  del club para llegar siquiera al servicio.

## F — El calendario

- [x] **T-450** `GET /calendar?date=` — el día por cancha, resuelto **contra la zona del club**
  (`plan.md` §5).
  Verificación: el mismo día devuelve lo mismo consultado desde dos zonas horarias distintas; una
  actividad de las 7:00 p.m. en Bogotá aparece en **ese** día y no en el siguiente; un día sin nada
  devuelve las canchas con sus franjas vacías, no una lista vacía sin contexto.
  ✅ 2026-08-11 — 11 tests. El día se resuelve con `rangoDelDia`, una función de dominio nueva que
  es la inversa de `toLocalDate`: «el martes» no es un instante hasta saber dónde queda el club.
  > Calcula el desfase **en dos pasadas**, porque el desfase de una zona depende del instante — hay
  > que saber ya de qué instante se habla para saber qué desfase aplicar. Colombia no cambia de hora
  > y con una pasada daría igual; en Santiago la primera se equivoca una hora dos veces al año, y
  > hay un test con el día de 23 horas que lo fija.
  > **Ese test señalaba el día equivocado y falló**: el día corto es el sábado, no el domingo. Se
  > comprobó contra `Intl` en qué día cambia el desfase antes de tocar nada — «arreglar» el código
  > para que el domingo diera 23 lo habría dejado mal para siempre y con un test verde encima.

- [x] **T-451** La privacidad aplicada en el servicio (R-040-07), con el contrato de unión
  discriminada.
  Verificación: **el test serializa la respuesta completa** y falla si aparece cualquier
  identificador de un evento ajeno y privado — no basta con comprobar que el campo `type` viene
  vacío. Los seis casos de T-412, ahora de punta a punta.
  > Es el test que protege la promesa del spec: nadie debe poder deducir del calendario quién toma
  > clases o taquea a cierta hora.
  ✅ 2026-08-11 — **Y se verificó que atrapa una fuga de verdad**: se agregó a mano el campo `type`
  al caso anónimo —lo que haría alguien sin pensar en la privacidad— y el test falló nombrando el
  dato: «la respuesta filtró *lesson*». Comprobar campo por campo no lo habría visto.
  > `participa` es `false` hoy y entra explícito: la participación se conoce cuando exista
  > `practice_application` (`specs/050`). Que esté escrito es lo que hace que, cuando llegue, se vea
  > de inmediato dónde conectarlo — la regla ya está probada con sus seis casos.

- [x] **T-452** Registrar las rutas nuevas en el arnés de aislamiento de tenant.
  Verificación: `pnpm check:isolation` en verde con las cinco rutas declaradas.
  ✅ 2026-08-11 — **Cierra la sección F.** Quedaron seis, no cinco: las cuatro de canchas entran al
  recorrido genérico, y las de bloqueo y calendario llevan test propio. El calendario no recibe
  identificadores sino una fecha, así que **su aislamiento es por lo que devuelve, no por lo que se
  le pide** — el recorrido genérico no habría probado nada.

## G — Pantallas

- [x] **T-460** **Calendario del día** (`/calendar`): tres columnas, una por cancha; lo ajeno y
  privado como «Ocupado». Mobile-first: en un celular es una cancha a la vez, deslizable.
  Verificación: tests de componente con las dos formas del contrato; que «Ocupado» **no renderice**
  ningún dato del evento aunque llegara por error en la respuesta.
  ✅ 2026-08-11 — 6 tests. **Nació con sus dos formas**: carrusel con ajuste por cancha en el
  celular, rejilla de columnas desde `md` — la misma estructura, cambia cómo se recorre.
  > Las horas se pintan con la zona **del club**, que viaja en la respuesta del calendario. Hay un
  > test que lo fija: jsdom corre en la zona de la máquina, y si la pantalla usara la zona local el
  > texto cambiaría según dónde corra el test — y según dónde viva quien mira.
  > El caso «Ocupado» del componente no tiene rama para pintar tipo ni nombre: aunque un día llegara
  > algo por error, no sabe mostrarlo. Los huecos entre actividades se muestran como «Libre de X a
  > Y», que es la otra mitad de la pregunta (HU-040-04).
  > El día viaja en la URL: «mira cómo quedó el martes» es un enlace que se puede mandar.

- [x] **T-461** **Canchas** (`/fields`): lista, crear, editar, archivar. Acceso desde el panel para
  quien administra.
  Verificación: el formulario no ofrece archivar una cancha ya archivada; el error de nombre
  repetido se muestra con el texto del club, no con el del servidor.
  ✅ 2026-08-11 — 5 tests. Una archivada no ofrece **ninguna** acción —no hay vuelta atrás que
  prometer— y muestra por qué ya no se puede programar en ella, en vez de desaparecer.

- [x] **T-462** **Bloquear una franja** desde el calendario, sobre una franja libre.
  Verificación: el choque con algo existente se muestra diciendo con qué choca; el motivo es
  obligatorio en el formulario, no sólo en el API.
  ✅ 2026-08-11 — 3 tests. **Cierra la sección G.** Las horas se escriben como las diría el club y
  se convierten con `instanteDelDia`, función de dominio nueva: armar `${dia}T${hora}:00-05:00` a
  mano fijaría el desfase de Bogotá en el código. Hay un test que comprueba el instante exacto que
  viaja.
  > El botón de bloquear no existe para un jugador: ofrecer lo que el API va a rechazar es mentir.

## H — Cierre

- [x] **T-470** E2E de navegador: el administrador bloquea una franja por riego, el calendario lo
  muestra, e intentar programar encima falla con un mensaje entendible.
  ✅ 2026-08-11 — el ciclo completo de HU-040-03 por las pantallas: bloquear → ver el motivo →
  chocar con el texto del club → levantar → la franja vuelve y lo que antes chocaba entra. Usa un
  día fijo lejano porque la base de desarrollo no se limpia entre corridas, y **deja el día limpio**
  al terminar. Además verificado a mano contra el API real a 574 px y 1440 px.
- [x] **T-471** `verification.md` con cada criterio de aceptación de `spec.md` mapeado a su test.
  Cualquier criterio sin test identificado se resuelve **antes** de dar el módulo por terminado.
  > En `specs/010` esta tarea destapó cuatro criterios que no estaban implementados, no sin probar.
  > No es papeleo.
  ✅ 2026-08-11 — mapa completo: 5 historias y las reglas transversales, cada una con su archivo y
  el título literal de su test. **Cierra el módulo 040**, con cuatro pendientes declarados y sus
  motivos — el mayor: `participa` es `false` hasta `specs/050`, con el punto de conexión escrito.
