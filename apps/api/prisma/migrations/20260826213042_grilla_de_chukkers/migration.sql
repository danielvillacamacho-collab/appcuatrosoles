-- `specs/052` T-711 — la grilla de chukkers, el resultado y el cierre de la práctica.
--
-- **Editada a mano.** Prisma generó, por quinta vez en este repo, un
-- `ALTER TABLE "field_booking" ALTER COLUMN "time_range" DROP DEFAULT` sobre una columna GENERATED,
-- que PostgreSQL rechaza con 42601 y que dejaría la migración sin aplicar. Se eliminó. Toda
-- migración de este repo hay que leerla antes de aplicarla, por esto exactamente.
--
-- `ADD VALUE` sobre un enum va primero y solo: PostgreSQL no permite **usar** un valor nuevo en la
-- misma transacción que lo crea. Acá nada lo usa, así que aplica; si algún día una migración
-- agrega un estado y lo asigna, hay que partirla en dos.

-- AlterEnum
ALTER TYPE "practice_status" ADD VALUE 'played';

-- AlterTable
ALTER TABLE "practice" ADD COLUMN     "closed_at" TIMESTAMPTZ(3),
ADD COLUMN     "closed_by_id" TEXT;

-- CreateTable
CREATE TABLE "chukker_grid_cell" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "practice_id" TEXT NOT NULL,
    "chukker_no" INTEGER NOT NULL,
    "team" "team_label" NOT NULL,
    "position" INTEGER NOT NULL,
    "person_id" TEXT,
    "horse_id" TEXT,

    CONSTRAINT "chukker_grid_cell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_result" (
    "practice_id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "team_a_goals" INTEGER NOT NULL,
    "team_b_goals" INTEGER NOT NULL,
    "notes" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "practice_result_pkey" PRIMARY KEY ("practice_id")
);

-- CreateIndex
CREATE INDEX "chukker_grid_cell_club_id_person_id_idx" ON "chukker_grid_cell"("club_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "chukker_grid_cell_practice_id_chukker_no_team_position_key" ON "chukker_grid_cell"("practice_id", "chukker_no", "team", "position");

-- CreateIndex
CREATE UNIQUE INDEX "chukker_grid_cell_practice_id_chukker_no_person_id_key" ON "chukker_grid_cell"("practice_id", "chukker_no", "person_id");

-- AddForeignKey
ALTER TABLE "chukker_grid_cell" ADD CONSTRAINT "chukker_grid_cell_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chukker_grid_cell" ADD CONSTRAINT "chukker_grid_cell_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_result" ADD CONSTRAINT "practice_result_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
