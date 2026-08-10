# 03 — Convenciones de API

REST sobre JSON. Cada regla de aquí existe para que un endpoint nuevo no tenga que
reinventar una decisión ya tomada.

## 1. Rutas y verbos

- Recursos en plural, en inglés (el código es en inglés — `CLAUDE.md` regla de oro 1):
  `GET /practices`, `POST /practices`, `GET /practices/:id`, `POST /practices/:id/apply`.
- Acciones que no son CRUD puro son sub-rutas verbo-sustantivo sobre el recurso:
  `POST /practices/:id/confirm`, `POST /practices/:id/withdraw-application`. No se abusa de
  `PATCH` genérico para modelar una transición de estado con reglas propias.
- El tenant nunca aparece en la ruta ni se lee del body: se resuelve del subdominio en un
  middleware anterior a cualquier controlador (`memory/constitution.md` P-05).
- Versionado por prefijo cuando haga falta romper un contrato: `/v2/practices`. Mientras haya
  un solo cliente (el propio `apps/web` desplegado junto al API), no se versiona por adelantado.

## 2. Formato de respuesta

**Éxito** — el recurso o la colección, sin envoltura adicional:
```json
{ "id": "...", "startsAt": "2026-08-10T23:00:00.000Z", "chukkers": 6 }
```

**Colecciones paginadas** — cursor, no offset (estable bajo inserciones concurrentes):
```json
{ "items": [ ... ], "nextCursor": "01J...", "hasMore": true }
```

**Error** — forma única en todo el API, siempre en este formato, siempre con mensaje en
español (`es-CO`) apto para mostrar directo al usuario si el frontend no tiene uno mejor:
```json
{
  "error": {
    "code": "PRACTICE_ALREADY_FULL",
    "message": "Esta práctica ya alcanzó el número máximo de jugadores.",
    "requestId": "req_01J...",
    "details": { "field": "practiceId" }
  }
}
```

`code` es estable y forma parte del contrato (el frontend puede ramificar sobre él); `message`
puede cambiar de redacción sin romper nada. `requestId` es el mismo que loguea Pino y busca
Sentry (`docs/07`) — es el hilo que conecta un reclamo de usuario con una traza.

## 3. Códigos de estado — sólo estos, con este significado fijo

| Código | Cuándo | Nota |
|---|---|---|
| `200` | Éxito de lectura o de acción que no crea recurso | |
| `201` | Se creó un recurso | `Location` con la URL del nuevo recurso |
| `204` | Éxito sin cuerpo (p. ej. `DELETE` lógico, cierre de sesión) | |
| `400` | El payload no valida contra el esquema Zod | `details` trae los campos exactos |
| `401` | No hay sesión válida | Nunca distingue "no existe" de "expiró" |
| `403` | Hay sesión válida, pero el rol no tiene el permiso | Sólo dentro del mismo club |
| `404` | El recurso no existe **o pertenece a otro club** | Ver P-05: nunca `403` entre tenants |
| `409` | Conflicto de estado (violación de `EXCLUDE`, doble postulación, etc.) | Traducido desde `23P01`/`23505` |
| `422` | El payload valida su forma pero viola una regla de negocio | p. ej. handicap fuera de rango |
| `429` | Límite de tasa (login, recuperación de contraseña) | |
| `500` | Error no esperado | Se loguea completo; al usuario sólo `requestId` |

## 4. Validación de contrato

Todo endpoint declara su esquema de entrada y de salida en `packages/contracts` con Zod. El
controlador valida la entrada antes de llegar al servicio; un test de contrato en CI llama al
endpoint real (contra Postgres de prueba) y valida la respuesta real contra el mismo esquema
(`ADR-014` punto 6) — no basta con que el tipo compile, la respuesta en runtime tiene que
cumplirlo.

## 5. Idempotencia

Toda mutación que puede reintentarse por una red inestable (crear un cobro, confirmar una
práctica, procesar un webhook) acepta o genera una **clave de idempotencia**:

- El cliente puede enviar `Idempotency-Key` en el header; si la reenvía, la respuesta es la
  misma que la primera vez, sin repetir el efecto.
- Los webhooks de pasarela usan su `external_event_id` como clave — no hay opción del
  cliente ahí, la idempotencia es intrínseca a la tabla `payment_event` (P-10, `docs/02`).
- Un job de `pg-boss` recibe su propia clave determinística (p. ej. `practice:<id>:decide`)
  para que reprocesar el job no cobre ni descuente dos veces (P-11).

## 6. Autorización — declarativa, nunca un `if` disperso

```ts
@RequirePermission('handicap.edit')
@Patch('players/:id/handicap')
updateHandicap(...) { ... }
```

El decorador es obligatorio en toda ruta mutante; su ausencia falla el arranque de la
aplicación, no una revisión de código (`memory/constitution.md` P-13, `ADR-014` punto 4).
Cada permiso nuevo se agrega al catálogo de `docs/06-security-privacy.md` §Matriz, nunca se
inventa inline sin registrar qué rol lo tiene.

## 7. Paginación, filtros y búsqueda

- Filtros como query params explícitos, no un lenguaje de consulta genérico:
  `GET /users?status=active&role=player&organizationId=...`.
- Búsqueda de texto libre: `?q=`, siempre acotada al ámbito del solicitante (un admin de
  organización nunca puede hacer `q=` sobre personas fuera de su organización).
- Límite de página por defecto 25, máximo 100. Pedir más de 100 es `400`, no un recorte
  silencioso.

## 8. Campos de fecha y dinero en el contrato

- Toda fecha/hora sobre el wire es ISO 8601 con offset (`2026-08-10T18:00:00-05:00` o UTC con
  `Z`); nunca una cadena ambigua sin zona.
- Todo campo de dinero en el contrato se llama `<algo>Cents` y es un entero (P-02). El
  frontend formatea a pesos colombianos en la capa de presentación, nunca antes.
- Todo campo de handicap se llama `<algo>Halves` y es un entero (P-03).

## 9. Auditoría automática

Un interceptor global registra en `audit_log` toda mutación (`POST`/`PATCH`/`DELETE`) que
toque una entidad marcada como auditable, con el estado antes/después serializado. Un
controlador no llama manualmente a "guardar auditoría" salvo que necesite un campo adicional
que el interceptor no puede inferir (p. ej. `on_behalf_of_id` en una acción de subcomisario).
