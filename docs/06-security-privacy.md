# 06 — Seguridad, privacidad y datos personales

Fuente funcional: PRD Parte II §5-8, §12-14 (`docs/source/documento_consolidado_polo2.txt`).
Fuente técnica: `ADR-005`, `ADR-013`, `memory/constitution.md` P-05 a P-07 y P-12.

## 1. Sesión

- Cookie `httpOnly`, `Secure`, `SameSite=Lax`, con un identificador **opaco** de sesión — no
  un JWT (`ADR-005`): el documento exige poder revocar sesiones ya emitidas (ver dispositivos
  activos, cerrar todas, corte inmediato al suspender), y un JWT no se revoca sin construir
  exactamente la tabla de sesiones que ya estamos usando.
- Sesiones en PostgreSQL (tabla `session`, `docs/02` §B), caché en memoria del proceso con
  TTL de 60 segundos (`ADR-012`, no hay Redis).
- Cierre automático por inactividad prolongada (default configurable, ver `docs/08`).
- El usuario ve sus sesiones/dispositivos activos desde su perfil y puede cerrarlas todas.
- Protección CSRF por doble envío de token en toda mutación.

## 2. Contraseñas

- Hash con **Argon2id**. Nunca texto legible, nunca reversible, ni siquiera para soporte.
- Mínimo 8 caracteres combinando letras y números; se rechazan las más comunes (lista de
  contraseñas filtradas conocidas). Sin expiración forzada periódica (práctica desaconsejada).
- Bloqueo tras 5 intentos fallidos seguidos: 15 minutos por defecto, configurable
  (`docs/08`), sin revelar si el bloqueo es por contraseña incorrecta o por cuenta inexistente.
- Recuperación: enlace de un solo uso, expira en 1 hora, y **al usarlo cierra todas las demás
  sesiones abiertas** de esa cuenta — si alguien más tenía una sesión activa por robo de
  credenciales, se corta ahí.
- Cambio de correo de acceso: requiere confirmación en el correo nuevo; el correo anterior
  sigue siendo válido hasta que se confirme.

## 3. No revelar lo que no se debe revelar (P-12)

Regla dura, sin excepciones de conveniencia:

- El error de login nunca dice cuál de los dos datos (correo o contraseña) falló, ni si el
  correo existe.
- La recuperación de contraseña siempre responde el mismo mensaje ("si el correo está
  registrado, te enviamos un enlace"), exista o no la cuenta.
- El calendario nunca permite deducir quién toma una clase privada o taquea a cierta hora: un
  evento privado ajeno se sirve como `{ start, end, field_id, label: "Ocupado" }`, sin
  `source_id`, sin tipo, sin nombre (`docs/02` §D). Se prueba serializando la respuesta y
  verificando que no aparece ningún identificador (`docs/05` §3).
- Un recurso de otro club responde `404`, nunca `403` (P-05) — `403` confirma que el recurso
  existe; en un contexto multi-tenant eso ya es una fuga.

## 4. RBAC — roles, alcance y matriz de permisos

Modelo completo en `docs/02` §B (`role_assignment`). Cuatro conceptos separados que no se
mezclan (PRD Parte II §1): **persona** (existe aunque no tenga cuenta), **cuenta de usuario**
(el acceso), **rol** (qué puede hacer, acumulativo, nunca restrictivo entre sí), **categoría
de membresía** (tarifas y derechos, no permisos).

Alcance de cada rol — `platform` (toda la plataforma), `club`, u `organization`:

| Rol | Alcance | Otorgado por |
|---|---|---|
| `superadmin` | plataforma | sólo otro `superadmin` |
| `club_admin` | club | `superadmin` o `club_admin` |
| `commissioner` | club | `superadmin` o `club_admin` |
| `organization_admin` | organización | `superadmin` o `club_admin` |
| `instructor`, `groom` | organización | `organization_admin` (dentro de su organización) o superior |
| `treasurer` | club u organización | según a qué ámbito se asigna |
| `player` | club | rol base automático de toda cuenta activa |

**Matriz de permisos del módulo base** (PRD Parte II §11 — ✓ = puede, · = limitado a lo
propio/su ámbito):

| Capacidad | superadmin | club_admin | org_admin | player |
|---|---|---|---|---|
| Crear/invitar usuarios | ✓ | ✓ | · | |
| Suspender/archivar usuario | ✓ | ✓ | · | |
| Asignar roles de club | ✓ | ✓ | | |
| Asignar roles de organización | ✓ | ✓ | ✓ | |
| Editar categoría de membresía | ✓ | ✓ | · | |
| Ver listado / exportar usuarios | ✓ | ✓ | · | |
| Ver registro de auditoría | ✓ | ✓ | · (su ámbito) | |
| Configurar reglas globales | ✓ | | | |
| Editar su propio perfil | ✓ | ✓ | ✓ | ✓ |

Las matrices de los módulos deportivo, clases, caballos y pagos se definen en sus propios
specs (`specs/NNN/spec.md §Reglas de negocio`), no aquí — este documento fija el mecanismo,
no cada permiso particular.

**Regla dura**: un administrador no puede suspenderse, archivarse ni quitarse roles a sí
mismo (evita bloqueos accidentales); debe hacerlo otro administrador.

## 5. Multi-tenant como control de seguridad, no sólo de datos (`ADR-013`)

- El tenant se resuelve **por subdominio del host**, antes de tocar la base de datos. Un host
  que no corresponde a ningún club activo responde `404` de inmediato.
- Un `clubId` que llega del cliente (body, query, header) nunca determina el tenant.
- Personal de servicio (nuestro, no del club cliente) tiene un **club activo** explícito en
  la sesión; cambiar de club activo es una acción auditada, nunca implícita.
- Toda ruta nueva trae su prueba de aislamiento generada; sin ella, el build falla
  (`ADR-014`, `docs/05` §3).
- Antes del segundo cliente (no del primero): revisión de seguridad externa con foco
  exclusivo en aislamiento entre clubes (`docs/10` §4 punto 3).

## 6. Menores de edad y cuentas familiares

PRD Parte I §3 y Parte II §1: un perfil de menor es una `person` completa (caballada propia,
bolsa de clases, handicap de club, estadísticas) **sin `user_account`**. El titular
(`guardianship`, `is_primary_payer`) actúa en su nombre: reserva, paga, firma exenciones.

- Los cobros de los perfiles a cargo se consolidan en el estado de cuenta del titular
  (invariante de `docs/02` §B).
- Al llegar a la edad definida por el club (`docs/08` Q-15, default 18), el perfil puede
  convertirse en cuenta propia **conservando** su historial deportivo y de pagos — nunca se
  recrea desde cero.
- Los datos de un menor reciben el mismo tratamiento de acceso restringido que cualquier dato
  sensible: sólo lo ve el titular, los administradores autorizados y quien tenga permiso
  explícito sobre esa organización.

## 7. Exención de responsabilidad (waiver)

`waiver_version` / `waiver_acceptance` (`docs/02` §B): no se puede postular a una práctica ni
reservar una clase sin aceptación vigente de la última versión publicada. En el caso de un
menor, la acepta su acudiente. Si el club publica un texto nuevo, se vuelve a solicitar.

## 8. Protección de datos personales (Ley 1581 de Colombia)

- Toda persona puede solicitar la **exportación** o el **borrado** de sus datos personales.
- El borrado real es el único camino que ejecuta un `DELETE` de verdad, y sólo sobre este
  flujo formal y auditado — nunca desde la operación normal de administración (P-06). Se
  conserva de forma anonimizada lo mínimo necesario para la integridad de resultados
  históricos (p. ej. un handicap histórico de equipo no puede perder un jugador sin que el
  cálculo deje de tener sentido; se reemplaza por un identificador anónimo, no se elimina la
  fila).
- Los datos sensibles (contacto, información de pagos) sólo los ven los roles autorizados
  según la matriz de §4 — no "todo administrador ve todo".
- Todo el acceso viaja por HTTPS (Caddy con TLS automático, `docs/07`).

## 9. Auditoría (P-07)

`audit_log` es append-only a nivel de permisos de PostgreSQL, no sólo de convención de
código. Registra como mínimo (PRD Parte II §12):

- Cambios de handicap (quién, valor anterior, valor nuevo, cuándo, y `on_behalf_of_id` si fue
  por delegación de subcomisario).
- Creación, suspensión y archivado de usuarios.
- Asignación y retiro de roles.
- Validación de resultados de copas.
- Perdón de clases o ajustes de bolsa.
- Cambio de club activo de personal de servicio (`specs/140` R-140-05).

## 10. Verificación en dos pasos (previsto, no v1)

Fuera de alcance del módulo base v1 (PRD Parte II §14), pero el modelo de `session` y
`user_account` no cierra la puerta: se agregaría como un paso adicional entre "contraseña
correcta" y "sesión creada", primero para roles administrativos. No se construye hasta que
haya una decisión explícita de agregarlo (`docs/09`).
