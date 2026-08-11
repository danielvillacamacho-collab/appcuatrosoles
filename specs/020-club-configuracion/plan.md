# PLAN-020 — Club, organizaciones, temporadas y configuración

> Depende de: `spec.md` (aceptado) · Revisado contra `docs/01-architecture.md`,
> `docs/02-domain-model.md` §A, `docs/08-configuration-catalog.md` y `memory/constitution.md`.

## 0. Decisión de diseño tomada al escribir este plan

**El catálogo de configuración vive en código, no en una tabla.** `spec.md` §7 mencionaba una
tabla `setting_definition`; se descarta, y el spec queda corregido.

El catálogo declara, por cada clave: su ámbito (`platform` | `club` | `organization`), su tipo, su
valor por defecto y de dónde sale (`docs/08`). La base guarda **sólo valores**.

La razón: agregar una clave de configuración **es siempre un cambio de código**, porque alguien
tiene que leerla. Una clave que se puede crear desde la base sin código que la consuma es
configuración que nadie aplica — un valor que el administrador cree que está cambiando algo y no
cambia nada, que es peor que no poder crearla. Con el catálogo en código, el compilador verifica
que la clave existe y que el tipo cuadra, igual que hicimos con los permisos en T-022a. El precio
—una clave nueva exige un despliegue— es el mismo que ya pagaba el código que la lee.

Lo que **no** cuesta un despliegue, que es lo que P-04 exige, es cambiar el **valor**: eso lo hace
el administrador desde la plataforma, y es el 99 % de los casos reales.

Los textos en español de cada clave (nombre visible, ayuda) van en `i18n/es-CO.ts` con la clave
como identificador, no en el catálogo: son copy, y el copy no vive en el dominio (regla de oro 1).

## 1. Esquema de datos (Prisma)

Corresponde a `docs/02` §A. Convenciones obligatorias del repo: `id` = UUID v7
(`@default(uuid(7))`), timestamps `@db.Timestamptz(3)` en UTC (P-08), fechas de calendario
`@db.Date`, snake_case en tablas y columnas, dinero `BigInt` con sufijo `_cents` (P-02).

```prisma
model Club {
  id       String     @id @default(uuid(7))
  /// Subdominio. Único en toda la plataforma, minúsculas, [a-z0-9-]. Es la frontera de tenant.
  slug     String     @unique
  name     String
  /// IANA. Define qué día es «hoy» para toda regla de calendario (R-020-13). Nunca se asume Bogotá.
  timezone String     @default("America/Bogota")
  /// ISO 4217. Informativa en v1: se opera en una sola moneda (R-020-14).
  currency String     @default("COP")
  status   ClubStatus @default(active)

  suspendedAt     DateTime? @db.Timestamptz(3)
  suspendedReason String?

  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  organizations Organization[]
  seasons       Season[]
  // person, membership_category, waiver_version… se enlazan en la migración de llaves foráneas
  // (§6): hoy su `club_id` es texto suelto.
}

enum ClubStatus {
  active
  suspended
}

model Organization {
  id     String @id @default(uuid(7))
  clubId String
  name   String
  /// school | team | service (docs/02 §A). Texto y no enum: el club puede tener otros tipos.
  type   String
  status OrganizationStatus @default(active)

  archivedAt DateTime? @db.Timestamptz(3)
  createdAt  DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt  DateTime  @updatedAt @db.Timestamptz(3)

  club Club @relation(fields: [clubId], references: [id], onDelete: Restrict)

  @@unique([clubId, name])
  @@index([clubId, status])
}

model Season {
  id       String @id @default(uuid(7))
  clubId   String
  name     String
  /// Fechas de calendario, no instantes: una temporada empieza un día, no a una hora (T-014).
  startsOn DateTime @db.Date
  endsOn   DateTime @db.Date
  status   SeasonStatus @default(open)

  closedAt  DateTime? @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt DateTime  @updatedAt @db.Timestamptz(3)

  club Club @relation(fields: [clubId], references: [id], onDelete: Restrict)

  @@unique([clubId, name])
  @@index([clubId, startsOn])
}

model Setting {
  id      String    @id @default(uuid(7))
  scope   ScopeKind
  /// Nulo sólo cuando scope = platform. Mismo criterio que `role_assignment` (T-002).
  scopeId String?
  /// Clave del catálogo de código. Un valor con clave desconocida no se puede insertar (R-020-09).
  key     String
  value   Json

  /// Desde cuándo rige. El vigente es el de mayor `effective_from` <= ahora (R-020-08).
  effectiveFrom DateTime @db.Timestamptz(3)
  createdById   String?
  createdAt     DateTime @default(now()) @db.Timestamptz(3)

  // Sin `updatedAt`: esta tabla no se actualiza nunca, se le agregan filas.
  @@unique([scope, scopeId, key, effectiveFrom])
  @@index([scope, scopeId, key, effectiveFrom])
}
```

**Invariantes que van en SQL crudo dentro de la migración**, porque Prisma no los expresa y una
comprobación que sólo vive en la aplicación se salta con un script (P-09):

| Invariante | Por qué |
|---|---|
| `slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'` | un slug con mayúsculas o puntos rompe la resolución por host de forma silenciosa |
| `scope = 'platform'` ⟺ `scope_id IS NULL` en `setting` | mismo invariante que `role_assignment`; sin él, un valor de plataforma con `scope_id` queda invisible |
| `season.ends_on >= season.starts_on` | una temporada que termina antes de empezar no es un dato, es un error |
| `EXCLUDE` sobre `(club_id, daterange(starts_on, ends_on, '[]'))` | R-020-06: dos temporadas del mismo club no se solapan. Es el caso de uso exacto de `EXCLUDE`, y es la única forma de garantizarlo bajo concurrencia |
| `organization.club_id` y `season.club_id` con `ON DELETE RESTRICT` | P-06: nada se borra en cascada por accidente |

> El `EXCLUDE` exige la extensión `btree_gist`. Se crea en la misma migración; ya se usará de
> nuevo en `specs/050` (una cancha no puede tener dos prácticas solapadas).

## 2. Estructura de archivos

```
packages/domain/src/tenant/
├── resolveTenant.ts            # host → club (specs/140 §9); función pura, sin base de datos
├── slug.ts                     # validación y normalización del subdominio
└── __tests__/

packages/domain/src/settings/
├── catalog.ts                  # el catálogo: clave → ámbito, tipo, default, fuente (docs/08)
├── resolveSetting.ts           # herencia organización → club → plataforma → default (R-020-10)
└── __tests__/

apps/api/src/tenant/
├── tenant.guard.ts             # T-020 de specs/010: resuelve el club y falla con 404
├── club.repository.ts          # el único que consulta `club` sin filtro de tenant, por definición
└── club-directory.ts           # caché en memoria del proceso, con TTL (docs/06 §1, ADR-012)

apps/api/src/club/
├── club.controller.ts          # datos del club, público mínimo en el subdominio
├── organization.controller.ts
├── season.controller.ts
├── membership-category.controller.ts
└── *.service.ts

apps/api/src/settings/
├── settings.controller.ts      # leer y fijar valores por ámbito
├── settings.service.ts
└── settings.repository.ts

apps/api/src/platform/
├── platform-clubs.controller.ts # alta, suspensión y reactivación (superadmin)
└── platform-clubs.service.ts

apps/api/prisma/bootstrap.ts     # HU-020-03: el primer club, por línea de comandos
```

## 3. Contratos clave (Zod, en `packages/contracts`)

```ts
export const CreateClubRequest = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  timezone: z.string().min(1),   // validado contra Intl, no contra una lista propia
  currency: z.string().length(3).default('COP'),
  adminEmail: z.string().email(),  // a quién se invita como primer administrador
});

export const ClubPublicResponse = z.object({   // pantalla de ingreso, sin sesión
  name: z.string(),
  timezone: z.string(),
});

export const SetSettingRequest = z.object({
  key: z.string(),
  value: z.unknown(),           // el tipo real lo impone el catálogo, no el contrato
  effectiveFrom: z.string().datetime().optional(),
});

export const SettingResponse = z.object({
  key: z.string(),
  value: z.unknown(),
  scope: z.enum(['platform', 'club', 'organization']),
  /** De dónde salió el valor: distinguirlo es la mitad de HU-020-08. */
  source: z.enum(['explicit', 'inherited', 'default']),
  effectiveFrom: z.string().datetime().nullable(),
});
```

`ClubPublicResponse` es deliberadamente pobre: es la única respuesta del sistema que se sirve **sin
sesión**, y todo campo que se le agregue es información que cualquiera puede leer apuntando al
subdominio (HU-020-09).

## 4. Permisos nuevos

| Permiso | Roles | Nota |
|---|---|---|
| `club.edit` | `superadmin`, `club_admin` | datos del club, zona horaria |
| `organization.manage` | `superadmin`, `club_admin`; `organization_admin` sólo la suya | |
| `season.manage` | `superadmin`, `club_admin` | |
| `membership.manage` | `superadmin`, `club_admin` | es la fila «editar categoría de membresía» de `docs/06` §4 que quedó sin nombre canónico en T-022a |
| `setting.edit` | por ámbito: plataforma → `superadmin`; club → `club_admin`; organización → su `organization_admin` | es «configurar reglas globales» de `docs/06` §4, ahora con nombre |
| `platform.club.manage` | `superadmin` | alta, suspensión y reactivación |

Se agregan al catálogo de `packages/domain/identity/hasPermission.ts` y a la matriz de `docs/06`
§4. **`setting.edit` es el primer permiso cuyo alcance depende del ámbito del valor**, no del
recurso de la ruta: es el caso que obliga a implementar el resolvedor de ámbito de organización que
T-022b dejó declarado como pendiente.

## 5. Resolución del tenant — el camino de una solicitud

1. Se lee el host de la solicitud, del encabezado que el despliegue declare como confiable
   (`docs/07`). **Nunca** de un `clubId` del cliente (R-020-01).
2. Se extrae el subdominio y se valida su forma. Un host malformado no llega a la base de datos.
3. Se busca el club **activo** con ese slug, contra la caché en memoria del proceso (TTL corto,
   `ADR-012`: no hay Redis).
4. Si no hay club, `404` inmediato, sin tocar la tabla de usuarios (HU-020-01, criterio literal).
5. El club resuelto queda en la solicitud, y de ahí lo leen `PermissionGuard` (T-022b) y
   `AuditInterceptor` (T-023), que ya lo esperan.

**La caché necesita invalidación explícita al suspender un club**, o R-020-04 («corta el acceso de
inmediato») se convierte en «corta el acceso en menos de un minuto». Es el mismo problema que quedó
anotado para la caché de sesiones en T-021, y se resuelve igual: quien suspende, invalida.

## 6. Migraciones — orden y puntos de atención

1. `club`, `organization`, `season`, `setting` + `btree_gist` + los invariantes en SQL.
2. **Las llaves foráneas que 010 dejó pendientes**: `person.club_id`,
   `person_organization.club_id` y `.organization_id`, `commissioner_delegation.club_id`,
   `membership_category.club_id`, `waiver_version.club_id`, `waiver_acceptance.club_id`,
   `audit_log.club_id`. Están anotadas en `schema.prisma` como entregable de este módulo.

> **Punto de atención, y es el riesgo real de este módulo.** Esa segunda migración falla si hay
> datos existentes con un `club_id` que no corresponde a ningún club — y los hay: el seed de T-006
> y los tests inventan identificadores libremente. El orden correcto es crear primero el club del
> seed y **migrar los datos existentes** en la misma migración, no sólo agregar la restricción.
> `audit_log` merece cuidado aparte: es append-only por triggers, así que una migración que
> pretenda actualizar sus filas **va a fallar**; hay que decidir explícitamente si se le pone la
> llave foránea (y entonces la migración debe correr con el rol dueño, que sí puede saltar el
> trigger) o si se deja sin ella y se documenta por qué.

3. Cada migración con su `down.sql`, probada en CI contra Postgres real (regla del repo).

## 7. Riesgos técnicos específicos de este plan

| Riesgo | Mitigación |
|---|---|
| La migración de llaves foráneas falla en producción por datos huérfanos | se migra el dato, no sólo el esquema; y se prueba contra una base con el seed aplicado, no vacía |
| `audit_log` no admite el `UPDATE` que necesitaría la migración | decidido explícitamente en su tarea, con la razón escrita; no se descubre a mitad del despliegue |
| El proxy inverso no reenvía el host y todos los clubes colapsan en uno | el encabezado se configura explícitamente y hay test de integración con **dos clubes simultáneos**, que es la única prueba que detecta esto |
| La caché de clubes sirve un club suspendido | invalidación explícita al suspender, con test que suspende y pide de inmediato |
| Un valor de configuración con tipo equivocado rompe un módulo al leerlo | se valida contra el catálogo **al escribir**; leer nunca falla por tipo |
| El `EXCLUDE` de temporadas no se puede crear por falta de `btree_gist` | la extensión se crea en la misma migración y el CI corre contra Postgres real, no un mock |

## 8. Qué genera `tasks.md`

En el orden del repo (esquema → dominio puro → repositorios → guards → controladores → cierre):

esquema y migraciones (incluida la de llaves foráneas y datos) → `resolveTenant`, `slug` y
`resolveSetting` como dominio puro → catálogo de configuración → `TenantGuard` (que cierra T-020 de
`specs/010`) → alta/suspensión de clubes y el script de arranque → organizaciones, temporadas y
categorías → configuración por ámbito con su historial → permisos nuevos en la matriz → E2E de
«club nuevo operativo» y de aislamiento entre dos clubes.
