-- CreateEnum
CREATE TYPE "org_relationship" AS ENUM ('student', 'client', 'team_member', 'staff');

-- CreateEnum
CREATE TYPE "role_name" AS ENUM ('superadmin', 'club_admin', 'organization_admin', 'commissioner', 'instructor', 'groom', 'treasurer', 'player');

-- CreateEnum
CREATE TYPE "scope_kind" AS ENUM ('platform', 'club', 'organization');

-- CreateEnum
CREATE TYPE "delegation_scope" AS ENUM ('season', 'tournament');

-- CreateTable
CREATE TABLE "person_organization" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "relationship" "org_relationship" NOT NULL,
    "joined_on" DATE NOT NULL,
    "left_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "person_organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignment" (
    "id" TEXT NOT NULL,
    "user_account_id" TEXT NOT NULL,
    "role" "role_name" NOT NULL,
    "scope" "scope_kind" NOT NULL,
    "scope_id" TEXT,
    "granted_by_id" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_by_id" TEXT,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissioner_delegation" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "delegator_id" TEXT NOT NULL,
    "delegate_id" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "scope" "delegation_scope" NOT NULL,
    "scope_id" TEXT,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commissioner_delegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_organization_club_id_organization_id_relationship_idx" ON "person_organization"("club_id", "organization_id", "relationship");

-- CreateIndex
CREATE INDEX "person_organization_person_id_idx" ON "person_organization"("person_id");

-- CreateIndex
CREATE INDEX "role_assignment_user_account_id_revoked_at_idx" ON "role_assignment"("user_account_id", "revoked_at");

-- CreateIndex
CREATE INDEX "role_assignment_scope_scope_id_idx" ON "role_assignment"("scope", "scope_id");

-- CreateIndex
CREATE INDEX "commissioner_delegation_club_id_delegate_id_revoked_at_idx" ON "commissioner_delegation"("club_id", "delegate_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "person_organization" ADD CONSTRAINT "person_organization_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioner_delegation" ADD CONSTRAINT "commissioner_delegation_delegator_id_fkey" FOREIGN KEY ("delegator_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioner_delegation" ADD CONSTRAINT "commissioner_delegation_delegate_id_fkey" FOREIGN KEY ("delegate_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariantes que Prisma no sabe expresar en el esquema y que por eso van en SQL.
-- Van en la base, no en la aplicación, por P-09: donde PostgreSQL puede volver
-- imposible una violación, no se confía en que el código se acuerde.
-- ─────────────────────────────────────────────────────────────────────────────

-- Un mismo rol, con el mismo alcance, no se puede otorgar dos veces a la vez.
-- Sin esto, otorgar dos veces y revocar una dejaría a la persona con el rol puesto y un
-- rastro de auditoría ambiguo. El COALESCE cubre el caso `scope = platform`, donde
-- `scope_id` es NULL y los NULL no chocarían entre sí.
CREATE UNIQUE INDEX "role_assignment_active_unique"
  ON "role_assignment" ("user_account_id", "role", "scope", COALESCE("scope_id", ''))
  WHERE "revoked_at" IS NULL;

-- `scope_id` es NULL exactamente cuando el alcance es `platform` (un superadmin no cuelga
-- de ningún club ni organización) y obligatorio en cualquier otro caso. Es el invariante
-- que documenta el modelo; aquí se vuelve inviolable.
ALTER TABLE "role_assignment"
  ADD CONSTRAINT "role_assignment_scope_id_matches_scope" CHECK (
    ("scope" = 'platform' AND "scope_id" IS NULL)
    OR ("scope" <> 'platform' AND "scope_id" IS NOT NULL)
  );

-- Una persona puede ser a la vez estudiante y jugadora de equipo en la misma organización,
-- pero no puede tener dos veces el MISMO vínculo activo.
CREATE UNIQUE INDEX "person_organization_active_unique"
  ON "person_organization" ("person_id", "organization_id", "relationship")
  WHERE "left_on" IS NULL;

-- No se puede salir de una organización antes de haber entrado.
ALTER TABLE "person_organization"
  ADD CONSTRAINT "person_organization_left_after_joined" CHECK (
    "left_on" IS NULL OR "left_on" >= "joined_on"
  );

-- Una delegación que termina antes de empezar no es una delegación.
ALTER TABLE "commissioner_delegation"
  ADD CONSTRAINT "commissioner_delegation_ends_after_starts" CHECK ("ends_at" > "starts_at");

-- El comisario no se delega a sí mismo: sería un registro de auditoría que no significa nada.
ALTER TABLE "commissioner_delegation"
  ADD CONSTRAINT "commissioner_delegation_delegate_differs" CHECK ("delegator_id" <> "delegate_id");
