# SPEC-140 — Plataforma multi-club y servicio administrado

> Estado: ready · Depende de: 010, 020 · Fuente: decisión D-01

## 1. Problema

La plataforma no es un encargo para Los Pinos: es un producto para clubes de polo, y encima
se venderá la **administración deportiva** (comisariato, gestión de torneos, gestión de
alumnos). Eso cambia dos cosas de fondo:

1. Los clubes son independientes entre sí y a veces compiten. Una fuga de datos entre clubes
   deja de ser un bug y pasa a ser el fin del negocio.
2. Nuestra gente trabaja en varios clubes a la vez. Un comisario nuestro necesita entrar al
   club A y al club B sin dos cuentas y sin confundirse de club.

Y hay una tercera, comercial: si montar un club nuevo toma dos días de configuración manual,
el servicio administrado no tiene margen. **El costo de aprovisionar un cliente es la
variable que decide si el negocio funciona.**

## 2. Resultado esperado

Un club nuevo se pone en marcha en menos de una hora desde una plantilla, con su subdominio y
su marca. Nuestro personal trabaja en varios clubes con una sola cuenta y un conmutador
explícito. Ningún club puede ver, ni por error ni por manipulación, nada del otro.

## 3. Fuera de alcance en v1

- Facturación de suscripción y cobro automático a los clubes (se cobra por fuera hasta tener
  más de tres clientes; agregarlo después no toca el núcleo).
- Autoservicio de registro: los clubes los damos de alta nosotros.
- Marca blanca con dominio propio del cliente (`polo.suclub.com`): en v1 es subdominio nuestro.
- Comparativos entre clubes (benchmarking). Requiere consentimiento contractual explícito;
  se evalúa cuando haya volumen.

## 4. Actores

| Rol | Puede |
|---|---|
| Superadministrador (nosotros) | crear clubes, aplicar plantillas, designar administradores, suspender clubes, ver métricas de la plataforma |
| Personal de servicio (nuestro comisario, gestor de torneos, gestor de academia) | operar dentro de los clubes donde tiene asignación, con el rol correspondiente |
| Administrador del club (cliente) | todo lo suyo; **nunca** ve que existen otros clubes |

## 5. Historias de usuario

### HU-140-01 — Dar de alta un club
**Como** superadministrador **quiero** crear un club desde una plantilla **para** que ponerlo
a funcionar cueste una hora, no dos días.

- **Dado** nombre, subdominio, plan y plantilla, **cuando** creo el club, **entonces** queda
  con sus categorías de membresía, tarifas base, políticas, formatos de copa y catálogos ya
  cargados, listos para ajustar.
- **Dado** un subdominio ya usado, **cuando** intento crearlo, **entonces** el sistema lo impide.
- **Dado** un club creado, **cuando** invito a su administrador, **entonces** él entra por su
  subdominio y no percibe en ningún lado que existan otros clubes.
- **Dado** una plantilla, **cuando** la ajusto, **entonces** los clubes ya creados no cambian:
  la plantilla es un punto de partida, no una dependencia viva.

### HU-140-02 — Aislamiento
**Como** club cliente **quiero** la certeza de que mis datos son míos.

- **Dado** un usuario del club A, **cuando** solicita cualquier recurso del club B por su
  identificador, **entonces** recibe 404, no 403 (no se confirma ni que existe).
- **Dado** el subdominio del club A, **cuando** la sesión pertenece al club B, **entonces**
  la sesión no sirve en ese host.
- **Dado** cualquier endpoint nuevo, **cuando** se agrega sin su prueba de aislamiento,
  **entonces** el build falla.

### HU-140-03 — Personal que trabaja en varios clubes
**Como** comisario de nuestro equipo **quiero** atender varios clubes con una sola cuenta
**para** no manejar credenciales distintas ni equivocarme de club.

- **Dado** que tengo asignación en tres clubes, **cuando** entro, **entonces** veo cuál es mi
  club activo, siempre visible, y puedo cambiarlo explícitamente.
- **Dado** que cambio de club activo, **cuando** lo hago, **entonces** todo lo que veo y todos
  mis permisos corresponden a ese club, y el cambio queda auditado.
- **Dado** que mi asignación en un club termina, **cuando** vence, **entonces** pierdo el
  acceso a ese club de inmediato y conservo los otros.
- **Dado** una acción mía en un club cliente, **cuando** se audita, **entonces** queda claro
  que la hizo personal de servicio, no del club.

### HU-140-04 — Marca del cliente
**Como** club cliente **quiero** ver mi logo y mis colores **para** que mi gente sienta que
es la plataforma del club.

- **Dado** un logo y un color primario cargados, **cuando** cualquiera entra por mi
  subdominio, **entonces** ve mi marca desde la pantalla de ingreso.
- **Dado** un color con contraste insuficiente, **cuando** se carga, **entonces** el sistema
  advierte y ofrece la variante accesible más cercana.

### HU-140-05 — Salud de la plataforma
**Como** superadministrador **quiero** ver cómo va cada club **para** saber a quién atender y
quién está en riesgo de irse.

- **Dado** el panel de plataforma, **cuando** lo abro, **entonces** veo por club: usuarios
  activos, actividad de la última semana, cobros procesados y fecha del último ingreso de su
  administrador.
- **Dado** un club sin actividad en dos semanas, **cuando** ocurre, **entonces** aparece
  marcado como en riesgo.
- **Dado** un club suspendido por falta de pago, **cuando** lo suspendo, **entonces** su gente
  ve un mensaje claro y sus datos se conservan intactos.

### HU-140-06 — Límites del plan
**Como** plataforma **quiero** que cada plan tenga límites **para** que el precio corresponda
al uso.

- **Dado** un plan con tope de personas activas, **cuando** el club se acerca al límite,
  **entonces** su administrador recibe aviso.
- **Dado** el límite superado, **cuando** intenta crear otra persona, **entonces** no puede y
  se le indica cómo ampliar el plan. Nunca se bloquea el acceso de quienes ya existen.

## 6. Reglas de negocio

- `R-140-01` El tenant se resuelve por subdominio. Un `clubId` recibido del cliente jamás
  determina el tenant.
- `R-140-02` Una sesión pertenece a un club; no sirve en el host de otro.
- `R-140-03` El recurso de otro club responde 404, nunca 403.
- `R-140-04` El personal de servicio tiene un club activo explícito; sin él no se evalúa
  ningún permiso.
- `R-140-05` Cambiar de club activo es una acción auditada.
- `R-140-06` Las acciones de personal de servicio se distinguen en la auditoría de las del
  personal del club.
- `R-140-07` Una plantilla se copia al crear; no queda vinculada.
- `R-140-08` Suspender un club bloquea el acceso y conserva todos los datos.
- `R-140-09` Los límites de plan restringen la creación, nunca el acceso de lo existente.
- `R-140-10` Ningún reporte cruza datos de clubes distintos sin consentimiento contractual
  registrado.

## 7. Datos

`tenant_plan`, `club_template`, `staff_membership` y los campos nuevos de `club` —
sección L de `docs/02-domain-model.md`.

## 8. Interfaz

```
GET  /platform/clubs                         superadmin
POST /platform/clubs                         superadmin  { name, slug, plan, templateId }
POST /platform/clubs/:id/suspend             superadmin
POST /platform/clubs/:id/reactivate          superadmin
GET  /platform/templates                     superadmin
POST /platform/templates                     superadmin
GET  /platform/dashboard                     superadmin
POST /platform/staff-memberships             superadmin
DELETE /platform/staff-memberships/:id       superadmin

GET  /me/clubs                               sesión → clubes donde tengo asignación
POST /me/active-club                         sesión → cambia el club activo (auditado)
GET  /clubs/current/branding                 público en el subdominio (pantalla de ingreso)
PUT  /clubs/current/branding                 club.update
```

Todo lo que cuelga de `/platform` exige rol `superadmin` **y** origen desde el host de
administración, no desde el subdominio de un cliente. Dos condiciones, no una.

## 9. Dominio puro

```ts
// packages/domain/tenancy
function resolveTenant(host: string, clubs: ClubRef[]): Result<ClubRef, UnknownTenant>
function activeClubFor(session: Session, memberships: StaffMembership[], at: Date): Result<ClubId>
function withinPlanLimits(plan: TenantPlan, usage: Usage): Result<void, LimitExceeded>
function applyTemplate(template: ClubTemplate): SeedOperations[]
```

## 10. Pantallas

- **Conmutador de club** (personal de servicio): siempre visible en la barra superior, con el
  nombre del club activo. No es un menú escondido: equivocarse de club es el error más caro
  que puede cometer un comisario que atiende a tres clientes.
- **Alta de club** (superadmin): asistente de tres pasos — datos, plantilla, administrador.
- **Panel de plataforma**: una fila por club con actividad, usuarios y estado; los clubes en
  riesgo arriba.
- **Marca del club**: carga de logo y color, con vista previa de la pantalla de ingreso.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Fuga entre clubes.** El riesgo número uno del negocio. | filtro forzado en la capa de datos + prueba de aislamiento generada por endpoint + 404 en vez de 403 + revisión de seguridad externa antes del segundo cliente |
| Personal de servicio operando en el club equivocado | club activo siempre visible, cambio explícito y auditado, y el nombre del club en cada pantalla de acción destructiva |
| Aprovisionar un cliente cuesta días y el servicio no da margen | plantillas + medir el tiempo real de alta del segundo cliente como indicador del negocio |
| Un cliente pide su propio dominio | previsto: Caddy resuelve certificados por host automáticamente; se habilita cuando haga falta |
| El servicio administrado exige procesos estandarizados que la plataforma no soporta | los primeros dos clientes se atienden manualmente y de ahí salen los requisitos reales; no se construye antes de saberlo |

## 12. Definición de terminado

- [ ] Prueba de aislamiento generada automáticamente por cada ruta registrada
- [ ] Un club nuevo, desde plantilla, operativo en menos de una hora, medido
- [ ] El conmutador de club auditado y visible en todas las pantallas
- [ ] Ningún endpoint acepta `clubId` del cliente para determinar el tenant (verificado por test)
