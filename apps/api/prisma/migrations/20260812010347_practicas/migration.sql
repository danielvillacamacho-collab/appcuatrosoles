-- T-520 · Prácticas (`specs/050`).
--
-- ⚠️ Prisma volvió a meter la línea de siempre y hubo que borrarla a mano:
--
--     ALTER TABLE "field_booking" ALTER COLUMN "time_range" DROP DEFAULT;
--
-- PostgreSQL la rechaza con ERROR 42601 porque `time_range` es una columna GENERATED, y la
-- migración entera falla. Es la tercera migración seguida que la trae. Ver la cabecera de
-- `20260811234305_handicaps`.

-- CreateEnum
CREATE TYPE "practice_status" AS ENUM ('draft', 'published', 'confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "practice_outcome" AS ENUM ('accepted', 'rejected', 'no_show');

-- CreateTable
CREATE TABLE "practice" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "season_id" TEXT,
    "field_id" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "chukkers" INTEGER NOT NULL,
    "handicap_type" "HandicapType" NOT NULL,
    "suggested_handicap_min_halves" INTEGER,
    "suggested_handicap_max_halves" INTEGER,
    "max_level_halves" INTEGER,
    "target_players" INTEGER NOT NULL,
    "min_players" INTEGER NOT NULL,
    "applications_close_at" TIMESTAMPTZ(3) NOT NULL,
    "decision_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "practice_status" NOT NULL DEFAULT 'draft',
    "cancellation_reason" TEXT,
    "field_booking_id" TEXT,
    "price_policy_id" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "practice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_application" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "practice_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "chukkers_offered" INTEGER NOT NULL,
    "half_man_partner_person_id" TEXT,
    "applied_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(3),
    "outcome" "practice_outcome",

    CONSTRAINT "practice_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_eligibility" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "max_handicap_halves" INTEGER NOT NULL,
    "granted_by_id" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_by_id" TEXT,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "practice_eligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "practice_field_booking_id_key" ON "practice"("field_booking_id");

-- CreateIndex
CREATE INDEX "practice_club_id_starts_at_idx" ON "practice"("club_id", "starts_at");

-- CreateIndex
CREATE INDEX "practice_status_decision_at_idx" ON "practice"("status", "decision_at");

-- CreateIndex
CREATE INDEX "practice_application_practice_id_applied_at_idx" ON "practice_application"("practice_id", "applied_at");

-- CreateIndex
CREATE INDEX "practice_eligibility_person_id_revoked_at_idx" ON "practice_eligibility"("person_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "practice" ADD CONSTRAINT "practice_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice" ADD CONSTRAINT "practice_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice" ADD CONSTRAINT "practice_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice" ADD CONSTRAINT "practice_field_booking_id_fkey" FOREIGN KEY ("field_booking_id") REFERENCES "field_booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_application" ADD CONSTRAINT "practice_application_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_application" ADD CONSTRAINT "practice_application_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_application" ADD CONSTRAINT "practice_application_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_eligibility" ADD CONSTRAINT "practice_eligibility_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_eligibility" ADD CONSTRAINT "practice_eligibility_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El índice único **parcial**, que Prisma no sabe expresar.
--
-- Una sola postulación vigente por persona y práctica, **pero sólo entre las no retiradas**: quien
-- se retiró tiene que poder volver a postularse (HU-050-03), y con un índice único total no
-- podría. Al volver entra al final de la fila, que es lo justo.
CREATE UNIQUE INDEX "una_postulacion_vigente"
  ON "practice_application" ("practice_id", "person_id")
  WHERE "withdrawn_at" IS NULL;
