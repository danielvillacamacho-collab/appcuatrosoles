-- CreateTable
CREATE TABLE "membership_category" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_fee_cents" BIGINT NOT NULL,
    "rights" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "membership_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_assignment" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "membership_category_id" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "assigned_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardianship" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "guardian_person_id" TEXT NOT NULL,
    "dependent_person_id" TEXT NOT NULL,
    "is_primary_payer" BOOLEAN NOT NULL DEFAULT false,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guardianship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membership_category_club_id_active_idx" ON "membership_category"("club_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "membership_category_club_id_code_key" ON "membership_category"("club_id", "code");

-- CreateIndex
CREATE INDEX "membership_assignment_club_id_person_id_effective_from_idx" ON "membership_assignment"("club_id", "person_id", "effective_from");

-- CreateIndex
CREATE INDEX "membership_assignment_membership_category_id_idx" ON "membership_assignment"("membership_category_id");

-- CreateIndex
CREATE INDEX "guardianship_club_id_dependent_person_id_idx" ON "guardianship"("club_id", "dependent_person_id");

-- CreateIndex
CREATE INDEX "guardianship_guardian_person_id_idx" ON "guardianship"("guardian_person_id");

-- AddForeignKey
ALTER TABLE "membership_assignment" ADD CONSTRAINT "membership_assignment_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_assignment" ADD CONSTRAINT "membership_assignment_membership_category_id_fkey" FOREIGN KEY ("membership_category_id") REFERENCES "membership_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_assignment" ADD CONSTRAINT "membership_assignment_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardianship" ADD CONSTRAINT "guardianship_guardian_person_id_fkey" FOREIGN KEY ("guardian_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardianship" ADD CONSTRAINT "guardianship_dependent_person_id_fkey" FOREIGN KEY ("dependent_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariantes en la base de datos (P-09).
-- ─────────────────────────────────────────────────────────────────────────────

-- `btree_gist` permite combinar igualdad (=) sobre una columna normal con solapamiento (&&)
-- sobre un rango dentro del mismo EXCLUDE. Es la extensión que hace posible el constraint de
-- abajo, y la misma que necesitarán las canchas y los caballos en los módulos 040 y 090.
--
-- El `down.sql` de esta migración NO la elimina, a propósito: es una capacidad del motor, no
-- un dato de este módulo, y otros módulos la usarán. Volver a crearla es idempotente.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Regla de producto del PRD §2: «cada persona tiene una única categoría vigente a la vez,
-- pero la plataforma guarda el historial». Aquí deja de ser una intención y se vuelve
-- imposible de violar: dos períodos de membresía de la misma persona no pueden solaparse,
-- ni siquiera si dos administradores guardan en el mismo segundo.
--
-- `effective_to` nulo significa «sigue vigente» (rango sin límite superior), y el rango es
-- semiabierto '[)': una membresía que termina el 1 de septiembre y otra que empieza ese
-- mismo día NO se consideran solapadas — es el caso normal de un cambio de categoría.
ALTER TABLE "membership_assignment"
  ADD CONSTRAINT "membership_assignment_no_overlap"
  EXCLUDE USING gist (
    "person_id" WITH =,
    daterange("effective_from", "effective_to", '[)') WITH &&
  );

ALTER TABLE "membership_assignment"
  ADD CONSTRAINT "membership_assignment_to_after_from" CHECK (
    "effective_to" IS NULL OR "effective_to" > "effective_from"
  );

-- Una cuota mensual negativa no existe. (Cero sí: hay categorías sin cuota.)
ALTER TABLE "membership_category"
  ADD CONSTRAINT "membership_category_fee_not_negative" CHECK ("monthly_fee_cents" >= 0);

-- R-010-10: un menor puede tener dos acudientes, pero **un solo pagador principal**, porque
-- en su estado de cuenta se consolidan los cobros del menor. Esto garantiza «como máximo uno
-- vigente»; que haya «al menos uno» no cabe en un constraint (depende de la fecha) y lo
-- vigila el job diario de integridad (T-071).
CREATE UNIQUE INDEX "guardianship_one_primary_payer"
  ON "guardianship" ("dependent_person_id")
  WHERE "is_primary_payer" AND "ends_on" IS NULL;

-- El mismo acudiente no se vincula dos veces al mismo menor mientras el vínculo esté activo.
CREATE UNIQUE INDEX "guardianship_active_unique"
  ON "guardianship" ("guardian_person_id", "dependent_person_id")
  WHERE "ends_on" IS NULL;

-- Nadie es acudiente de sí mismo.
ALTER TABLE "guardianship"
  ADD CONSTRAINT "guardianship_guardian_differs" CHECK ("guardian_person_id" <> "dependent_person_id");

ALTER TABLE "guardianship"
  ADD CONSTRAINT "guardianship_ends_after_starts" CHECK (
    "ends_on" IS NULL OR "ends_on" >= "starts_on"
  );
