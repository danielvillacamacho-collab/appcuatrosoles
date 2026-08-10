# 00 — Decisión de stack (ADRs)

Cada decisión trae: contexto, decisión, alternativas descartadas y consecuencia.
Nada aquí se cambia sin agregar un ADR nuevo que supersede al anterior.

## Criterios de decisión (en este orden)

1. **Velocidad con un agente.** El código lo va a escribir Claude Code en su mayoría.
   Gana el stack con más densidad de convención, tipos fuertes y estructura predecible:
   el agente comete menos errores donde el framework le impone dónde va cada cosa.
2. **Un solo lenguaje.** Menos contexto que cargar, tipos compartidos entre back y front,
   un solo runtime que operar en la EC2.
3. **Operabilidad de una persona.** Debe caber en una EC2 con `docker compose up -d`.
4. **Reemplazabilidad del talento.** En Bogotá/Medellín, TypeScript + React + Postgres
   es el pool más profundo y barato de reemplazar.
5. **Reglas de negocio densas.** El polo tiene matemática real (balanceo, ventaja por
   handicap, fixtures, ledgers). Necesitamos aislar eso del framework.

---

## ADR-001 — TypeScript en todo el stack

**Decisión.** TypeScript `strict` en backend, frontend, dominio y scripts. Monorepo con
pnpm workspaces.

**Por qué.** Un solo lenguaje elimina la traducción de contratos entre back y front:
el tipo de `Practice` es literalmente el mismo objeto en los dos lados. Con un agente
escribiendo código, el compilador es el revisor más barato que existe.

**Descartado.**
- *Python (Django/FastAPI):* excelente para dominio, pero obliga a duplicar tipos hacia
  el front y su tipado gradual no le da al agente la misma red de seguridad.
- *Go:* runtime superior y despliegue trivial, pero mucho más código por feature y el
  pool de talento local es más caro. No hay problema de rendimiento que lo justifique.
- *Java/Kotlin + Spring:* sobredimensionado para ~500 usuarios y una EC2.

**Consecuencia.** Prohibido `any`. Node 22 LTS en todos lados.

---

## ADR-002 — Backend: NestJS + Prisma + PostgreSQL 16

**Decisión.** NestJS como framework HTTP, Prisma como ORM/migraciones, PostgreSQL 16
como base de datos única.

**Por qué NestJS.** Es el framework Node con la convención más fuerte: módulos, inyección
de dependencias, guards, interceptores y pipes. Eso le da al agente un lugar obvio para
cada cosa y hace que la autorización sea declarativa (`@RequirePermission('handicap.edit')`)
en vez de dispersa en `if`. La estructura repetitiva es una ventaja, no un costo, cuando
el que escribe es un agente.

**Por qué Prisma.** Migraciones versionadas y reversibles, cliente tipado generado desde
el esquema, y buen soporte para *extensions* con las que forzamos el filtro multi-tenant
a nivel de cliente. Donde Prisma se queda corto (tablas de posiciones, reportes,
agregaciones), se cae a SQL crudo tipado — está permitido y documentado.

**Por qué Postgres.** Necesitamos cosas que sólo Postgres da bien y son centrales aquí:
- `EXCLUDE USING gist` con `tstzrange` para **impedir doble reserva de cancha y de caballo
  a nivel de base de datos**, no de aplicación. Esta es la razón técnica más fuerte del
  proyecto: la regla "dos actividades no pueden pedir la misma cancha a la misma hora"
  se vuelve imposible de violar, incluso con condiciones de carrera.
- `jsonb` para configuración y para el payload de auditoría.
- Transacciones serias para el ledger de bolsas y cobros.

**Descartado.** Express plano (poca estructura para un agente), Fastify + tRPC (más
liviano pero cierra la puerta a integraciones externas y a una app nativa futura),
Drizzle (excelente, menos maduro en migraciones), MongoDB (el dominio es relacional
y transaccional; sería un error).

---

## ADR-003 — Frontend: React 19 + Vite + TanStack Query + TanStack Router

**Decisión.** SPA en React 19 compilada con Vite, servida como estáticos. Datos con
TanStack Query. Ruteo con TanStack Router (rutas tipadas). Formularios con
React Hook Form + Zod.

**Por qué no Next.js.** Es una aplicación privada tras login: no hay SEO, no hay páginas
públicas que renderizar en servidor. Next en una EC2 agrega un proceso Node más que
mantener, una capa de caché que depurar y una superficie de despliegue mayor a cambio de
un beneficio que aquí no existe. Un bundle estático detrás de Caddy es más rápido de
operar y más barato de correr.

**Excepción prevista.** Si más adelante se quiere una página pública de la copa (fixture
y posiciones visibles sin login, cosa que el documento menciona), se resuelve con una
ruta pública prerenderizada del mismo SPA, no migrando a Next.

**Por qué TanStack Query.** El 90 % del estado de esta app es estado del servidor
(quién se postuló, cómo va la bolsa, qué hay en el calendario). Query resuelve caché,
revalidación, reintentos y estados de carga sin escribir un store. Zustand sólo para el
poco estado local que sobra (filtros del calendario, borrador de la grilla de chukkers).

---

## ADR-004 — UI: Tailwind CSS 4 + shadcn/ui (Radix) + tokens propios

**Decisión.** Tailwind con tokens de diseño propios (`docs/04-frontend-conventions.md`),
componentes base de shadcn/ui copiados al repo (no como dependencia), Radix por debajo
para accesibilidad.

**Por qué.** shadcn se copia al repositorio, así que el agente puede modificar los
componentes sin pelear con una librería. Radix garantiza foco, teclado y ARIA correctos
sin que nadie los piense. Tailwind mantiene el CSS local al componente y evita la deriva
de estilos que sufre un proyecto escrito por un agente en muchas sesiones.

---

## ADR-005 — Sesiones de servidor con cookie, no JWT

**Decisión.** Cookie `httpOnly`, `Secure`, `SameSite=Lax`, con identificador opaco de
sesión. Las sesiones viven en Postgres (tabla `session`), con caché en Redis.

**Por qué.** El documento pide explícitamente: ver mis dispositivos activos, cerrar sesión
en todos, cierre inmediato al cambiar contraseña, y que suspender una cuenta corte el
acceso **ya**. Un JWT no se puede revocar sin construir una lista de revocación, que es
exactamente una tabla de sesiones con más pasos. Se elige lo simple y correcto.

**Consecuencia.** El backend es stateful respecto a sesiones. Con una sola EC2 no hay
problema; si algún día hay dos instancias, la sesión ya está compartida en Postgres/Redis.
Protección CSRF por doble envío de token en mutaciones.

---

## ADR-006 — Trabajos programados: BullMQ + Redis, con reconciliador

**Decisión.** BullMQ sobre Redis para trabajos diferidos, en un proceso `worker` separado.
Además, un *cron* de reconciliación cada 5 minutos que barre estados vencidos.

**Por qué el reconciliador.** La hora de decisión de las prácticas (6:00 p.m.), la ventana
de 1 hora del cupo liberado y los recordatorios son promesas al usuario. Si el worker
estuvo caído, un trabajo diferido perdido significa una práctica que nunca se confirmó.
El barrido periódico e idempotente convierte el sistema en autocorrectivo: el estado
correcto se puede recalcular siempre desde los datos, el job sólo lo adelanta.

**Regla.** Todo job debe ser idempotente y llevar clave de idempotencia. Correrlo dos
veces no puede cobrar dos veces ni descontar dos clases.

---

## ADR-007 — Pagos: puerto + adaptador, webhook idempotente

**Decisión.** La plataforma nunca toca tarjetas. Define un puerto
`PaymentGateway { createPaymentLink(charge): PaymentLink; verifyWebhook(req): PaymentEvent }`
y un adaptador por proveedor. Primer adaptador: **Wompi** (recomendado), con PayU y
Mercado Pago como implementaciones alternativas del mismo puerto.

**Por qué Wompi.** Del ecosistema Bancolombia, integración por API moderna, soporta PSE,
tarjetas, Nequi y Bancolombia a la Mano — que es como paga la gente en Colombia. Firma
de webhook documentada. PayU es válido pero su integración es más antigua y pesada.
**Esta decisión requiere confirmación del club** (ver `docs/09-open-questions.md`, Q-02).

**Consecuencia.** El estado del cobro sólo cambia por webhook verificado o por
conciliación manual con evidencia; nunca por el retorno del navegador, que es falsificable.

---

## ADR-008 — Correo transaccional: Amazon SES

**Decisión.** SES en la misma región de la EC2, detrás de un puerto `Mailer`.
Plantillas MJML compiladas a HTML en build.

**Por qué.** Ya estamos en AWS, el costo es despreciable y la entregabilidad es buena si
se configuran SPF, DKIM y DMARC del dominio del club. Requiere salir del sandbox de SES
(trámite de 1-2 días) — se hace en la semana 1, no al final. Alternativa lista para
cambiar en una línea: Resend.

---

## ADR-009 — Un solo despliegue: EC2 + Docker Compose + Caddy

**Decisión.** Una instancia EC2 (t3.small para arrancar), Docker Compose con: `api`,
`worker`, `web` (estáticos servidos por Caddy), `postgres`, `redis`, `caddy`.
TLS automático con Caddy. Backups por `pg_dump` cifrado a S3, diario, con retención 30 días
y **restauración probada mensualmente**.

**Por qué Caddy y no Nginx.** Certificados automáticos sin certbot ni cron de renovación.
Menos piezas que se rompen a los 90 días.

**Por qué Postgres en contenedor y no RDS.** Se pidió simplicidad. Con volumen EBS
dedicado, snapshots diarios de EBS y `pg_dump` a S3, el riesgo es aceptable para este
tamaño. El camino a RDS está abierto: la aplicación sólo conoce una `DATABASE_URL`.
**Se recomienda migrar a RDS el día que la plataforma cobre dinero real de terceros.**

**Descartado.** Kubernetes (absurdo a esta escala), serverless (los jobs programados y
las sesiones lo vuelven incómodo), PaaS tipo Railway/Render (más caro y menos control,
pero es la salida si nadie quiere operar la EC2).

---

## ADR-010 — Aplicación web instalable (PWA), no app de tienda

**Decisión.** PWA: manifiesto, íconos, service worker con caché de la carcasa y de
consultas de sólo lectura. Instalable desde el navegador. Sin publicar en tiendas.

**Por qué.** El documento es explícito: plataforma web, no app descargable. La PWA da el
ícono en la pantalla de inicio y el arranque rápido sin costo de tiendas ni de revisiones.
Deja preparado el tablero de petiseros, que necesita funcionar con mala señal en las
caballerizas: se implementa con cola de escritura diferida en fase 2.

**Consecuencia.** Notificaciones push del navegador quedan disponibles pero opcionales;
en iOS exigen que el usuario instale la PWA. Los canales garantizados son correo y campana
dentro de la plataforma.

---

## ADR-011 — Multi-tenant desde el día uno, un solo club en producción

**Decisión.** Modelo con `club_id` en toda tabla de negocio y `organization_id` donde
aplique, con filtrado forzado en la capa de datos. Se despliega un solo club (Los Pinos).

**Por qué.** El costo de agregar la columna y el guard hoy es de horas; el costo de
retrofitear multi-tenancy sobre datos reales es de semanas y con riesgo de fuga de datos
entre clubes. Además el documento ya contempla varias organizaciones dentro del club y
deja la puerta abierta a otros clubes.

**Consecuencia.** Queda abierta la opción de convertir esto en un producto vendible a
otros clubes de polo sin reescribir el núcleo. Facturación de suscripción y marca blanca
quedan **fuera de alcance** hasta que exista esa decisión de negocio (Q-01).

---

## Resumen ejecutable

| Capa | Elección |
|---|---|
| Lenguaje | TypeScript 5.x `strict`, Node 22 LTS |
| Monorepo | pnpm workspaces + Turborepo |
| API | NestJS 11, REST, validación con Zod |
| Datos | PostgreSQL 16 + Prisma 6 |
| Dominio | `packages/domain`, TypeScript puro, sin dependencias |
| Cola | BullMQ + Redis 7 |
| Front | React 19 + Vite 6 + TanStack Router/Query + Tailwind 4 + shadcn/ui |
| Auth | Sesión de servidor en cookie, Argon2id para contraseñas |
| Correo | Amazon SES |
| Pagos | Puerto `PaymentGateway`; adaptador Wompi (por confirmar) |
| Archivos | S3 con URLs prefirmadas |
| Tests | Vitest, Supertest, Testcontainers, Playwright |
| Observabilidad | Pino (JSON), Sentry, `/health` y `/ready` |
| Infra | 1 × EC2, Docker Compose, Caddy, backups a S3 |
| CI/CD | GitHub Actions → build, test, migrar, desplegar por SSH |

---

## ADR-012 — Se elimina Redis: colas y caché sobre PostgreSQL

**Supersede parcialmente a ADR-006.**

**Contexto.** El sistema lo va a construir y operar una sola persona sin equipo de ingeniería
detrás (D-04). Cada servicio adicional es un modo de falla más que alguien tiene que
diagnosticar a las 8 de la noche, y Redis es el que más silenciosamente se degrada
(memoria llena, `maxmemory-policy` que evicta lo que no debía, datos que no persisten).

**Decisión.** Se elimina Redis. En su lugar:
- **Colas y trabajos programados:** `pg-boss`, que implementa cola con reintentos, retrasos y
  cron sobre PostgreSQL, con las mismas garantías transaccionales que el resto de los datos.
- **Sesiones:** sólo PostgreSQL, con caché en memoria del proceso (TTL de 60 segundos).
  Con una instancia no hay problema de coherencia; con dos, el TTL corto lo acota.
- **Límites de tasa:** tabla en PostgreSQL con ventana deslizante. A esta escala sobra.

**Beneficio real.** Un contenedor menos, una URL de conexión menos, un backup menos que
pensar. Y algo más importante: **un trabajo encolado dentro de la misma transacción que crea
el dato** — encolar el correo de confirmación de práctica y guardar la práctica se hacen
juntos o no se hacen. Con Redis eso exige el patrón outbox; con pg-boss es gratis.

**Costo.** PostgreSQL como cola aguanta miles de trabajos por minuto; aquí habrá decenas por
hora. Si algún día no diera, volver a Redis es cambiar un adaptador detrás del puerto
`JobQueue`, que ya existe.

---

## ADR-013 — Multi-tenant operativo, no sólo en el modelo

**Supersede a ADR-011.**

**Contexto.** D-01: la plataforma se venderá a otros clubes, y encima se venderán servicios
de administración deportiva. Eso cambia el problema: no es "un club con organizaciones", es
"muchos clubes independientes, algunos administrados por nosotros".

**Decisión.**
- Aislamiento por `club_id` en toda tabla, forzado en la capa de datos, **con base de datos
  única y esquema único**. No una base por cliente: multiplicaría migraciones y operación por
  el número de clientes, que es exactamente lo que una persona sola no puede sostener.
- **Personas que trabajan en varios clubes.** Un comisario nuestro puede tener rol en el club
  A y en el club B. El modelo ya lo soporta (`role_assignment` con alcance), pero la sesión
  gana un **club activo** y un conmutador de club en la interfaz.
- **Acceso por subdominio**: `lospinos.<dominio>`, `clubx.<dominio>`. Resuelve el club desde
  el host, no desde un selector, y permite marca por cliente sin código.
- **Plantillas de configuración**: un club nuevo se crea desde una plantilla (categorías,
  tarifas base, políticas) en minutos, no en una sesión de configuración de dos horas. Esto
  es lo que hace que el servicio de administración sea rentable.
- **Sin facturación de suscripción en v1.** Los primeros clientes se cobran por fuera. Se
  agrega cuando haya más de tres.

**Consecuencia crítica de seguridad.** Con clubes que compiten entre sí, una fuga entre
tenants deja de ser un error y pasa a ser un incidente comercial. Por eso los tests de
aislamiento se generan automáticamente por cada endpoint y CI falla si aparece una ruta sin
su prueba. Ver `specs/140`.

---

## ADR-014 — Barreras automáticas en lugar de revisión de código humana

**Contexto.** D-04: no habrá otro ingeniero revisando lo que produce el agente. La revisión
de código es el control de calidad que se pierde; hay que reemplazarlo con controles que una
máquina pueda ejecutar y que una persona no técnica pueda interpretar.

**Decisión.** CI bloquea el despliegue si falla cualquiera de estas, y cada una reporta en
español qué se rompió y qué hacer:

1. **Fitness functions de arquitectura** (`dependency-cruiser`): el dominio no importa
   framework; la capa de aplicación no importa Prisma; ninguna feature importa de otra.
2. **Cobertura** con los umbrales de `docs/05`.
3. **Aislamiento de tenant**: prueba generada por cada ruta registrada. Ruta sin prueba → falla.
4. **Autorización**: cada ruta necesita un test con rol permitido y otro con rol denegado.
   Ruta sin decorador de permiso → falla en arranque, no en producción.
5. **Migraciones**: `up` y `down` aplicados contra Postgres real en CI.
6. **Contratos**: la respuesta real de cada endpoint valida contra su esquema Zod.
7. **Secretos**: escaneo del diff.
8. **Dependencias**: vulnerabilidad alta bloquea.
9. **Presupuesto de bundle**: si el paquete inicial supera 200 KB comprimido, falla.
10. **Sin `any`, sin `@ts-ignore`, sin `console.log`** en código de producción.

**El principio:** si una regla importa, se automatiza. Una regla que sólo vive en la cabeza
de quien revisa no existe cuando no hay quien revise.
