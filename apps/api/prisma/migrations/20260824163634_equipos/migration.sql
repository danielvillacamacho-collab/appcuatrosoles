-- T-610 · Equipos y puestos (`specs/051`).
--
-- ⚠️ Cuarta migración seguida en que Prisma mete
--     ALTER TABLE "field_booking" ALTER COLUMN "time_range" DROP DEFAULT;
-- y hubo que borrarla. PostgreSQL la rechaza con 42601 porque la columna es GENERATED, y la
-- migración entera falla. Ver la cabecera de `20260811234305_handicaps`.

-- CreateEnum
CREATE TYPE "team_label" AS ENUM ('A', 'B');

-- CreateTable
CREATE TABLE "practice_team" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "practice_id" TEXT NOT NULL,
    "label" "team_label" NOT NULL,
    "handicap_total_halves" INTEGER NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "practice_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_slot" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "practice_team_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "primary_person_id" TEXT NOT NULL,
    "secondary_person_id" TEXT,
    "effective_handicap_halves" INTEGER NOT NULL,
    "cost_share_primary_pct" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "practice_slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "practice_team_practice_id_label_key" ON "practice_team"("practice_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "practice_slot_practice_team_id_position_key" ON "practice_slot"("practice_team_id", "position");

-- AddForeignKey
ALTER TABLE "practice_team" ADD CONSTRAINT "practice_team_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_team" ADD CONSTRAINT "practice_team_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_slot" ADD CONSTRAINT "practice_slot_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_slot" ADD CONSTRAINT "practice_slot_primary_person_id_fkey" FOREIGN KEY ("primary_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_slot" ADD CONSTRAINT "practice_slot_secondary_person_id_fkey" FOREIGN KEY ("secondary_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_slot" ADD CONSTRAINT "practice_slot_practice_team_id_fkey" FOREIGN KEY ("practice_team_id") REFERENCES "practice_team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
