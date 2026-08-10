# Constitución de ingeniería

> Estos principios no se negocian en una tarea puntual. Si algo aquí choca con lo que pide
> un spec o un plan, **gana la constitución**: se corrige el spec, no se rompe el principio.
> Cambiar algo de este documento exige una decisión explícita de Daniel, registrada en
> `docs/09-open-questions.md`, nunca una elección silenciosa del agente.

## 1. Por qué existe este documento

Este proyecto lo construye una sola persona con un agente, sin otro ingeniero revisando cada
diff (`docs/09` D-04). Un revisor humano normalmente detiene un problema porque *reconoce que
algo se ve mal*, aunque no sepa articular la regla. Sin ese revisor, la regla tiene que estar
escrita, y tiene que estar escrita antes de que el código exista — no descubierta después del
incidente. Cada principio de este documento nació de una pregunta muy concreta: "¿qué se
rompe si el agente, en la sesión 80, no se acuerda de esto?"

## 2. Los principios

### P-01 — El dominio del polo es código puro
Toda regla de negocio del polo (balanceo de equipos, ventaja por handicap, fixtures,
desempates, ledger de bolsas, políticas de cancelación) vive en `packages/domain`. Ese
paquete no importa NestJS, Prisma, HTTP, ni nada que hable con el mundo exterior. No lee la
fecha del sistema: recibe un `Clock` inyectado.
**Por qué.** Si la regla "un puesto compartido pesa el máximo de los dos handicaps" vive
mezclada con una consulta SQL, no se puede probar sin base de datos, no se puede leer sin
conocer Prisma, y tarde o temprano alguien la reimplementa distinta en otro archivo. Ver
`docs/09` — es de las cinco cosas que un revisor humano atraparía y aquí no hay revisor.

### P-02 — El dinero es un entero
Toda cantidad de dinero se representa en centavos COP, tipo `bigint`, con sufijo `_cents` en
el nombre del campo. Prohibido `float` o `number` de JavaScript para cualquier cifra que
represente plata, en cualquier capa.
**Por qué.** `0.1 + 0.2 !== 0.3` en punto flotante. Un error de redondeo en un cobro no es un
bug cosmético: es plata real de una persona real. Se elimina la clase de error entera, no se
mitiga.

### P-03 — El handicap es un entero de medios goles
Se persiste como `_halves: int` (1.5 goles → `3`). Prohibido decimal en base de datos. La
conversión a texto ("1.5") vive únicamente en `packages/domain/handicap` y en la capa de
presentación.
**Por qué.** Mismo problema que P-02, aplicado a la cifra que decide quién compite contra
quién. Una discusión sobre "con cuánto estaba jugando" nunca puede originarse en un error de
representación numérica.

### P-04 — Todo lo configurable es configuración, no código
Precios, cupos, horas de decisión, ventanas de cancelación, penalizaciones, desempates y
catálogos viven en la tabla `setting` (`docs/02` §A), con ámbito e historia, nunca en una
constante del código. Ver el catálogo completo en `docs/08-configuration-catalog.md`.
**Por qué.** El club cambia estos valores por decisión de negocio, no por necesidad técnica.
Si cambiarlos exige un despliegue, la plataforma le devuelve al club la misma dependencia de
"un técnico" que hoy tiene con la hoja de cálculo — el problema que se vino a resolver.

### P-05 — Multi-tenant es un requisito de seguridad, no una feature
Toda tabla de negocio lleva `club_id`. El filtro se aplica en la capa de repositorio, nunca
en el controlador ni confiando en que el llamador lo recuerde. El tenant se resuelve por
subdominio del host; un `clubId` que llega del cliente (body, query, header) **nunca**
determina el tenant. Un recurso de otro club responde `404`, nunca `403`.
**Por qué.** `docs/09` D-01: esto se vende a clubes que compiten entre sí. Una fuga de datos
entre tenants no es un bug con severidad alta: es el fin del negocio. `403` confirma que el
recurso existe; `404` no revela nada. Todo endpoint nuevo trae su prueba de aislamiento
generada — sin ella, el build falla (`ADR-014`).

### P-06 — Nada se borra, todo se archiva
Ningún flujo normal de la aplicación ejecuta `DELETE` sobre datos de negocio. Los estados
tienen una transición a `archived`/`cancelled`/`revoked`, reversible por un administrador. El
borrado real de datos personales existe como un flujo formal y auditado, separado, invocado
sólo por solicitud del titular (Ley 1581 — `docs/06-security-privacy.md`).
**Por qué.** El historial deportivo y de pagos es el activo del club. Un `DELETE` accidental
—o uno "correcto" que después resulta que no debía haber pasado— no tiene deshacer. El
archivado sí.

### P-07 — La auditoría es append-only
`audit_log` sólo admite `INSERT` y `SELECT`, incluso para el rol de base de datos que usa la
aplicación — no es una convención de la capa de servicio, es un permiso de PostgreSQL.
**Por qué.** El propósito de una auditoría que se puede editar es cero. Esta tabla es la que
resuelve una disputa ("¿quién cambió este handicap?") meses después; su valor depende
enteramente de que nadie, ni un administrador, pueda haberla tocado.

### P-08 — El tiempo es UTC en la base de datos y explícito en el dominio
Todo timestamp se persiste `timestamptz` en UTC. Se renderiza en `America/Bogota`. Prohibido
`new Date()` dentro de `packages/domain`: toda función que necesita "ahora" recibe un
parámetro `now: Date` o un puerto `Clock`.
**Por qué.** Una regla como "la hora de decisión son las 6:00 p.m." es intestable si la
función que la implementa decide sola qué hora es. Con el reloj inyectado, un test escribe
literalmente `"dado que son las 5:59 p.m."` y `"dado que son las 6:01 p.m."` sin esperar ni
mockear el sistema operativo.

### P-09 — Los invariantes críticos los garantiza la base de datos, no la aplicación
Donde PostgreSQL puede hacer imposible una violación (`EXCLUDE USING gist` contra doble
reserva de cancha y de caballo, `UNIQUE` contra postulaciones duplicadas), se usa esa
restricción — no un `SELECT` seguido de un `INSERT` con la esperanza de que nadie más escriba
al mismo tiempo.
**Por qué.** Es la razón técnica más fuerte para elegir PostgreSQL (`ADR-002`). Una condición
de carrera entre dos administradores guardando al mismo segundo es un escenario real en un
club, no uno teórico, y la aplicación sola no puede cerrarla con certeza.

### P-10 — Ninguna acción con dinero cambia de estado por algo que el navegador puede falsificar
El estado de un cobro sólo cambia por un webhook de la pasarela con firma verificada, o por
conciliación manual con evidencia adjunta y auditoría. Nunca por el retorno del navegador
tras un pago.
**Por qué.** El "regresé de la pasarela y la URL dice éxito" es controlado enteramente por el
usuario. Es la vía de fraude más obvia y más común en integraciones de pago mal hechas.

### P-11 — Un job encolado y un dato guardado son la misma transacción, o no son nada
Cuando una acción de negocio implica guardar un dato y encolar un trabajo derivado (crear una
práctica y encolar su recordatorio), ambos ocurren en la misma transacción de base de datos.
**Por qué.** `ADR-012` eligió `pg-boss` sobre PostgreSQL exactamente por esto: un correo
prometido que se pierde porque el proceso murió entre "guardué el dato" y "encolé el aviso"
es un defecto silencioso — nadie se entera hasta que un usuario reclama no haber sido
avisado.

### P-12 — Nunca se revela por error lo que no se debe revelar
Un mensaje de error de login nunca indica si el correo existe. La API de calendario nunca
expone quién está en un evento privado ajeno. Un recurso ajeno responde `404`, no `403`. La
enumeración de cuentas, eventos o datos de terceros a través de mensajes de error o de
tiempos de respuesta se trata como una vulnerabilidad, no como un detalle de UX.
**Por qué.** `docs/06` — el club maneja datos de menores de edad. La superficie de fuga más
común no es el ataque sofisticado: es el mensaje de error bien intencionado que confirma algo
que no debía confirmar.

### P-13 — Ninguna regla vive sólo en la cabeza de quien programó
Si una regla de negocio importa lo suficiente para estar en el PRD o en un spec, tiene un
test que la nombra en español y que falla si la regla se rompe (`docs/05`). Si una regla de
calidad importa (cobertura, aislamiento, autorización, arquitectura), está en el CI y bloquea
el build — no en una lista de cosas que "hay que recordar revisar" (`ADR-014`).
**Por qué.** Es el reemplazo explícito del revisor humano que no existe en este proyecto
(D-04, `docs/10-operating-manual-solo.md`). Una regla no automatizada, en una sesión 150,
para una persona sin equipo, no existe.

### P-14 — No se escribe código de producción sin spec
El ciclo es siempre `spec.md → plan.md → tasks.md → implementación → verification.md`
(`CLAUDE.md`). Donde falte información, se pregunta; el supuesto que sí se tome se marca
`[SUPUESTO]` en el spec, nunca se decide en silencio dentro del código.
**Por qué.** Es la única forma en que Daniel, sin leer cada línea de implementación, puede
verificar que lo construido es lo que el club necesita: comparando el spec contra la realidad
del club, no leyendo TypeScript.

### P-15 — Cada capa cae en su lugar por diseño, no por disciplina
`packages/domain` no importa framework. La capa de aplicación no importa Prisma directamente
fuera de sus repositorios. Ninguna feature del backend importa de otra feature salvo por sus
puertos públicos. Estas reglas se verifican con fitness functions de arquitectura
(`dependency-cruiser`) en CI, no se piden por convención.
**Por qué.** La disciplina no escala a 400 tareas ejecutadas por un agente en sesiones
independientes. Una regla verificada por una herramienta no se erosiona con el tiempo; una
que depende de que "el agente se acuerde" sí.

## 3. Cómo se resuelve un conflicto

Si una tarea concreta parece exigir romper uno de estos principios (por ejemplo, "sólo esta
vez, guardemos el precio en `float` porque es más simple"), la respuesta correcta es parar y
preguntar, no ceder. Ver `docs/10-operating-manual-solo.md` §2 — "detente cuando…". La
excepción legítima existe (por eso el dominio permite `[SUPUESTO]`), pero se declara, se
justifica y queda escrita; nunca se cuela como un detalle de implementación.
