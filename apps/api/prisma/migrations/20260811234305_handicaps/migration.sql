-- T-320 · Handicaps (`specs/030`).
--
-- ⚠️ Prisma generó aquí una línea de más y hubo que borrarla a mano:
--
--     ALTER TABLE "field_booking" ALTER COLUMN "time_range" DROP DEFAULT;
--
-- `time_range` está declarada como `Unsupported("tstzrange")?` porque Prisma no sabe expresar una
-- columna GENERATED, así que cree que le falta un default y lo "arregla" en CADA migración nueva.
-- La línea **no es inofensiva**: PostgreSQL la rechaza con
--   ERROR 42601: column "time_range" of relation "field_booking" is a generated column
-- y la migración entera falla al aplicarse. Comprobado contra Postgres real antes de borrarla.
--
-- **Toda migración futura hay que revisarla por esto.** `prisma migrate deploy` corre desde cero en
-- el arranque de los tests de integración, así que si vuelve a colarse, la suite no arranca.

-- CreateEnum
CREATE TYPE "HandicapType" AS ENUM ('international', 'club');

-- CreateTable
CREATE TABLE "player_handicap" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "type" "HandicapType" NOT NULL,
    "value_halves" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_handicap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handicap_history" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "type" "HandicapType" NOT NULL,
    "previous_halves" INTEGER NOT NULL,
    "new_halves" INTEGER NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "on_behalf_of_id" TEXT,
    "reason" TEXT NOT NULL,
    "season_id" TEXT,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handicap_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_handicap_club_id_type_idx" ON "player_handicap"("club_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "player_handicap_person_id_type_key" ON "player_handicap"("person_id", "type");

-- CreateIndex
CREATE INDEX "handicap_history_person_id_type_changed_at_idx" ON "handicap_history"("person_id", "type", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "handicap_history_club_id_changed_at_idx" ON "handicap_history"("club_id", "changed_at" DESC);

-- AddForeignKey
ALTER TABLE "player_handicap" ADD CONSTRAINT "player_handicap_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_handicap" ADD CONSTRAINT "player_handicap_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handicap_history" ADD CONSTRAINT "handicap_history_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handicap_history" ADD CONSTRAINT "handicap_history_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handicap_history" ADD CONSTRAINT "handicap_history_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handicap_history" ADD CONSTRAINT "handicap_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handicap_history" ADD CONSTRAINT "handicap_history_on_behalf_of_id_fkey" FOREIGN KEY ("on_behalf_of_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
