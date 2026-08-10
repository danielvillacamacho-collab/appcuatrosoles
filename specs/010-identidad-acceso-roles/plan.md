# PLAN-010 — Identidad, acceso y roles

> Depende de: `spec.md` (aceptado) · Antes de generar `tasks.md`, este plan se revisa contra
> `docs/01-architecture.md`, `docs/02-domain-model.md` y `memory/constitution.md`.

## 1. Esquema de datos (Prisma)

Subconjunto de `docs/02-domain-model.md` §B, con los tipos concretos que va a tener
`prisma/schema.prisma`. Convenciones: `id` = UUID v7 (`@default(uuid7())` vía extensión, o
generado en aplicación si Prisma no lo soporta nativo — decidir en T-001), timestamps
`timestamptz`.

```prisma
model Person {
  id             String   @id @default(uuid())
  clubId         String
  fullName       String
  phone          String?
  email          String?  // informativo; el correo de acceso vive en UserAccount
  birthdate      DateTime?
  photoKey       String?
  isMinor        Boolean  @default(false)
  status         PersonStatus @default(active)
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  createdById    String?

  userAccount        UserAccount?
  organizations      PersonOrganization[]
  roleAssignments    RoleAssignment[]        @relation("PersonRoles") // via UserAccount en realidad; ver §2 nota
  membershipHistory  MembershipAssignment[]
  waiverAcceptances  WaiverAcceptance[]
  guardianOf         Guardianship[] @relation("Guardian")
  dependentOf        Guardianship[] @relation("Dependent")

  @@index([clubId, status])
  @@unique([clubId, email]) // sólo si email no nulo — constraint parcial, ver migración
}

enum PersonStatus { active archived }

model UserAccount {
  id               String   @id @default(uuid())
  personId         String   @unique
  email            String
  passwordHash     String
  status           UserAccountStatus @default(invited)
  failedAttempts   Int      @default(0)
  lockedUntil      DateTime?
  lastLoginAt      DateTime?
  emailVerifiedAt  DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  person           Person   @relation(fields: [personId], references: [id])
  sessions         Session[]
  roleAssignments  RoleAssignment[]

  @@unique([email]) // único global de momento; revisar si multi-club exige @@unique([clubId, email]) — ver Riesgo R-1
}

enum UserAccountStatus { invited active suspended archived }

model Session {
  id            String   @id @default(uuid())
  userAccountId String
  tokenHash     String   @unique
  userAgent     String?
  ipHash        String?
  createdAt     DateTime @default(now())
  lastSeenAt    DateTime @default(now())
  expiresAt     DateTime
  revokedAt     DateTime?
  rememberMe    Boolean  @default(false)

  userAccount   UserAccount @relation(fields: [userAccountId], references: [id])
  @@index([userAccountId, revokedAt])
}

model PersonOrganization {
  id             String   @id @default(uuid())
  personId       String
  organizationId String
  relationship   OrgRelationship
  joinedOn       DateTime
  leftOn         DateTime?

  person Person @relation(fields: [personId], references: [id])
  @@index([organizationId, relationship])
}
enum OrgRelationship { student client team_member staff }

model RoleAssignment {
  id            String   @id @default(uuid())
  userAccountId String
  role          RoleName
  scope         ScopeKind
  scopeId       String
  grantedById   String
  grantedAt     DateTime @default(now())
  revokedAt     DateTime?
  revokedById   String?

  userAccount   UserAccount @relation(fields: [userAccountId], references: [id])
  @@index([userAccountId, revokedAt])
  @@index([scope, scopeId])
}
enum RoleName { superadmin club_admin organization_admin commissioner instructor groom treasurer player }
enum ScopeKind { platform club organization }

model CommissionerDelegation {
  id            String   @id @default(uuid())
  delegatorId   String
  delegateId    String
  startsAt      DateTime
  endsAt        DateTime
  scope         DelegationScope
  scopeId       String?
  revokedAt     DateTime?
}
enum DelegationScope { season tournament }

model Guardianship {
  id                String   @id @default(uuid())
  guardianPersonId  String
  dependentPersonId String
  isPrimaryPayer    Boolean  @default(false)
  startsOn          DateTime
  endsOn            DateTime?

  guardian   Person @relation("Guardian", fields: [guardianPersonId], references: [id])
  dependent  Person @relation("Dependent", fields: [dependentPersonId], references: [id])
  @@index([dependentPersonId, isPrimaryPayer])
}
// Invariante R-010-10 / "exactamente un is_primary_payer=true vigente" se aplica en
// aplicación (transacción) + se verifica con job de integridad diario, no sólo constraint.

model MembershipCategory {
  id             String  @id @default(uuid())
  clubId         String
  code           String  // student | temporary_member | permanent_member | partner | guest
  name           String
  monthlyFeeCents BigInt
  rights          Json
  active          Boolean @default(true)
  @@unique([clubId, code])
}

model MembershipAssignment {
  id                    String   @id @default(uuid())
  personId              String
  membershipCategoryId  String
  effectiveFrom         DateTime
  effectiveTo           DateTime?
  assignedById          String

  person Person @relation(fields: [personId], references: [id])
  @@index([personId, effectiveFrom])
}

model WaiverVersion {
  id           String   @id @default(uuid())
  clubId       String
  version      Int
  body         String
  publishedAt  DateTime
  @@unique([clubId, version])
}

model WaiverAcceptance {
  id                  String   @id @default(uuid())
  personId            String
  waiverVersionId     String
  acceptedByPersonId  String   // el acudiente si es menor
  acceptedAt          DateTime @default(now())
  ipHash              String?

  person Person @relation(fields: [personId], references: [id])
  @@index([personId, waiverVersionId])
}

model AuditLog {
  id            String   @id @default(uuid())
  clubId        String
  actorUserId   String?
  onBehalfOfId  String?
  action        String
  entityType    String
  entityId      String
  before        Json?
  after         Json?
  occurredAt    DateTime @default(now())
  requestId     String

  @@index([clubId, entityType, entityId])
  @@index([occurredAt])
}
// A nivel de migración SQL (no expresable en schema.prisma): REVOKE UPDATE, DELETE ON
// audit_log FROM app_user; GRANT SELECT, INSERT ON audit_log TO app_user. Ver T-0XX.
```

**Nota sobre `RoleAssignment` y `Person` (§1 arriba, comentario en el modelo):** el rol se
asigna a `UserAccount`, no a `Person` — una persona sin cuenta no puede tener rol (coherente
con HU-010-03: un invitado externo sin cuenta simplemente no tiene `RoleAssignment`). La
relación `PersonRoles` del borrador inicial se retira antes de generar la migración; queda
sólo `UserAccount.roleAssignments`.

## 2. Estructura de archivos

```
apps/api/src/modules/identity/
├── identity.module.ts
├── auth/
│   ├── auth.controller.ts        # /auth/*
│   ├── auth.service.ts
│   ├── password.service.ts       # Argon2id, políticas de complejidad
│   └── session.service.ts        # crear/revocar/listar sesiones
├── users/
│   ├── users.controller.ts       # /users/*
│   ├── users.service.ts
│   └── users.repository.ts       # único lugar que toca Prisma para Person/UserAccount
├── roles/
│   ├── roles.controller.ts       # /users/:id/roles
│   └── roles.service.ts
├── guardianship/
│   ├── guardianship.controller.ts
│   └── guardianship.service.ts
├── waivers/
│   ├── waivers.controller.ts
│   └── waivers.service.ts
├── me/
│   └── me.controller.ts          # /me/*
├── audit/
│   ├── audit.controller.ts       # GET /audit-log
│   └── audit.interceptor.ts      # global, registra mutaciones marcadas @Auditable()
└── __tests__/

packages/domain/src/identity/
├── accountStatus.ts              # T-010 · vocabulario propio del dominio (no el enum de Prisma)
├── login.ts                      # T-010 · accountStatusAllowsLogin + resolveLoginOutcome
├── canAssignRole.ts
├── resolvePrimaryPayer.ts
├── isWaiverAcceptanceCurrent.ts
├── isInvitationLinkValid.ts
└── __tests__/

> **Dos ajustes hechos al ejecutar T-010.**
>
> 1. El plan preveía sólo `accountStatusAllowsLogin(status): boolean`, y resultó insuficiente para
>    su propio spec: HU-010-04 pide un mensaje distinto según el estado, y con un booleano el
>    controlador tendría que volver a mirar el estado para elegir el texto — duplicando la regla
>    justo donde es fácil equivocarse con el orden. Se agregó `resolveLoginOutcome`, que decide el
>    intento completo y **encierra el orden «contraseña primero, estado después»** que exige
>    R-010-07. El booleano se conserva porque es útil por sí solo.
> 2. El dominio define su **propio** tipo `AccountStatus` en vez de importar el enum de Prisma:
>    `packages/domain` no puede depender de la base (P-01), y el repositorio traduce en el borde.
>    Son cuatro palabras duplicadas a cambio de poder probar las reglas sin base de datos.

packages/contracts/identity/
├── login.schema.ts
├── user.schema.ts
├── role-assignment.schema.ts
└── ...

apps/api/src/common/
├── guards/
│   ├── session.guard.ts          # exige sesión válida, adjunta CurrentUser
│   ├── permission.guard.ts       # lee @RequirePermission, evalúa contra roles del CurrentUser
│   └── tenant.guard.ts           # resuelve club por subdominio, lo adjunta al request
└── decorators/
    ├── require-permission.decorator.ts
    ├── current-user.decorator.ts
    └── auditable.decorator.ts
```

## 3. Contratos clave (Zod, resumen — el detalle completo va en `packages/contracts`)

```ts
export const LoginRequest = z.object({ email: z.string().email(), password: z.string().min(1), rememberMe: z.boolean().optional() });
export const CreateUserRequest = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  categoryId: z.string().uuid(),
  roles: z.array(z.enum(['player','instructor','groom','treasurer','commissioner','club_admin','organization_admin'])).default(['player']),
  organizationId: z.string().uuid().optional(),
});
export const UserResponse = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  status: z.enum(['invited','active','suspended','archived']),
  roles: z.array(z.object({ role: z.string(), scope: z.string(), scopeId: z.string().uuid() })),
  categoryId: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
});
```

## 4. Permisos — mapa decorador → rol (resumen operativo de `docs/06` §4)

| Permiso | Roles que lo tienen |
|---|---|
| `user.create` | `superadmin`, `club_admin`, `organization_admin` (sólo su organización) |
| `user.edit` | igual que `user.create` |
| `user.suspend` / `user.archive` | `superadmin`, `club_admin`, `organization_admin` (sólo su organización) |
| `role.assign` (alcance club) | `superadmin`, `club_admin` |
| `role.assign` (alcance organización) | + `organization_admin`, sólo dentro de la suya |
| `user.export` | `superadmin`, `club_admin`, `organization_admin` (filtrado a su ámbito) |
| `audit.view` | `superadmin`, `club_admin`, `organization_admin` (sólo su ámbito) |

`PermissionGuard` evalúa **rol + alcance** juntos: tener `organization_admin` no basta para
pasar `role.assign` si el `scopeId` del body no coincide con una organización donde el actor
tiene esa asignación vigente — esto es lo que hace cumplir R-010-04 en la capa de guard, no
sólo en el service (defensa en profundidad).

## 5. Jobs (`pg-boss`, `ADR-012`)

| Job | Disparado por | Idempotencia |
|---|---|---|
| `identity.send-invitation` | crear/reenviar invitación | clave `invite:<userAccountId>:<sentAt>` — reenviar genera nuevo envío explícitamente, no se deduplica entre sí |
| `identity.send-password-reset` | `POST /auth/password/forgot` | clave `reset:<tokenHash>` |
| `identity.notify-role-changed` | asignar/retirar rol | clave `role-change:<roleAssignmentId>` |
| `identity.notify-account-status-changed` | suspender/reactivar/archivar | clave `status-change:<userAccountId>:<newStatus>:<changedAt>` |
| `identity.check-primary-payer-integrity` | cron diario | recalcula y alerta si algún `dependentPersonId` activo no tiene exactamente un payer vigente |

Todo job se encola en la misma transacción que el cambio de datos que lo origina (P-11).

## 6. Migraciones — orden y puntos de atención

1. Extensiones: `pgcrypto` o equivalente para generación de UUID si no se genera en app.
2. Tablas de §1, en orden de dependencia (`Person` → `UserAccount` → `Session`,
   `RoleAssignment`; catálogos de membresía antes de `MembershipAssignment`).
3. Constraint parcial `@@unique([clubId, email])` en `Person` sólo cuando `email IS NOT NULL`
   — Prisma no expresa unicidad parcial nativamente; se agrega con SQL crudo en la migración
   generada (`CREATE UNIQUE INDEX ... WHERE email IS NOT NULL`).
4. Permisos de base de datos sobre `audit_log`: `REVOKE UPDATE, DELETE ... GRANT SELECT,
   INSERT ...` al rol de aplicación (P-07) — en SQL crudo, no expresable en `schema.prisma`.
5. Cada migración se prueba `up` → `down` → `up` en CI (`docs/05` §6) antes de aceptarse.

## 7. Riesgos técnicos específicos de este plan

| Riesgo | Mitigación |
|---|---|
| ~~R-1: unicidad de correo global vs. por club~~ — **RESUELTO** (2026-08-10) | Confirmado por Daniel como **`docs/09` D-05**: `UserAccount.email` es único **global**. Una persona = un correo = un acceso, con club activo explícito en la sesión. Implementado en T-001. Se corrigió la nota contradictoria de `docs/02` §B. |
| Constraint de "exactamente un payer vigente" no es expresable como `CHECK` simple en Postgres (depende de fecha vigente, no de un booleano único por fila) | se aplica en transacción de aplicación (al crear un guardianship como payer, se cierra `endsOn` del anterior) + job de integridad diario (§5) que alerta, no corrige solo |
| `PermissionGuard` mal implementado deja pasar una acción de alcance equivocado | test de autorización obligatorio por endpoint (`docs/05` §3) cubre exactamente este caso; además test específico "admin de organización X no puede asignar rol de club" |
| Argon2id mal configurado (parámetros de costo insuficientes) | se fija el perfil de parámetros (memoria/iteraciones) en `password.service.ts` con un comentario del por qué, revisado en la primera auditoría externa (`docs/10` §4 punto 1) |

## 8. Qué genera `tasks.md`

`tasks.md` parte este plan en tareas de 30-90 minutos (`docs/10` §9), cada una con su archivo
o grupo de archivos, en el orden: esquema → dominio puro → repositorios → guards/decoradores →
auth → users/roles → me → guardianship/waivers → auditoría → jobs → E2E de los flujos
críticos de este módulo.
