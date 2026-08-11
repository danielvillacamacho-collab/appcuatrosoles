-- specs/040-canchas · T-401
--
-- Lo que Prisma genera solo son las tablas, los enums y las llaves foráneas. Lo que sigue —la
-- extensión, la columna generada, la restricción de exclusión y el CHECK— está escrito a mano,
-- igual que los triggers de `audit_log` en T-004: es la garantía del módulo y Prisma no la sabe
-- expresar.

-- `field_id` es un uuid y GiST no lo sabe comparar por igualdad sin esta extensión. Sin ella, la
-- restricción de abajo no se puede crear y el error («data type uuid has no default operator
-- class») no menciona la extensión por ningún lado.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "FieldStatus" AS ENUM ('active', 'maintenance', 'archived');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('practice', 'lesson', 'tournament_match', 'stick_and_ball', 'coaching', 'maintenance', 'block');

-- CreateEnum
CREATE TYPE "BookingVisibility" AS ENUM ('public', 'private');

-- CreateTable
CREATE TABLE "field" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surface" TEXT,
    "capacity_notes" TEXT,
    "status" "FieldStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_booking" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "type" "BookingType" NOT NULL,
    "visibility" "BookingVisibility" NOT NULL DEFAULT 'public',
    "source_id" TEXT,
    "reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "field_booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_club_id_status_idx" ON "field"("club_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "field_club_id_name_key" ON "field"("club_id", "name");

-- CreateIndex
CREATE INDEX "field_booking_club_id_starts_at_idx" ON "field_booking"("club_id", "starts_at");

-- CreateIndex
CREATE INDEX "field_booking_field_id_starts_at_idx" ON "field_booking"("field_id", "starts_at");

-- AddForeignKey
ALTER TABLE "field" ADD CONSTRAINT "field_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_booking" ADD CONSTRAINT "field_booking_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_booking" ADD CONSTRAINT "field_booking_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_booking" ADD CONSTRAINT "field_booking_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── La garantía del módulo (R-040-02) ────────────────────────────────────────

-- El rango se **deriva** de sus propios extremos y no se puede escribir: PostgreSQL rechaza
-- cualquier intento, incluso desde psql. Así no existe forma de guardar un rango incoherente con
-- las fechas que muestra la aplicación.
--
-- El `'[)'` es la convención semiabierta de R-040-04, y ponerla aquí significa que ningún módulo
-- futuro puede elegir otra por descuido: algo que termina a las 5:30 y algo que empieza a las 5:30
-- **no** se solapan.
ALTER TABLE "field_booking"
  ADD COLUMN "time_range" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

-- Dos actividades no pueden ocupar la misma cancha a la misma hora. Lo garantiza la base, no la
-- aplicación: dos administradores guardando al mismo tiempo no pueden crear un choque ni queriendo.
-- El `WHERE` es lo que hace que una reserva cancelada no ocupe (R-040-03).
ALTER TABLE "field_booking"
  ADD CONSTRAINT "no_field_overlap"
  EXCLUDE USING gist ("field_id" WITH =, "time_range" WITH &&)
  WHERE ("cancelled_at" IS NULL);

-- Una reserva que termina antes de empezar no es un caso de negocio: es un dato roto.
ALTER TABLE "field_booking"
  ADD CONSTRAINT "field_booking_ends_after_starts" CHECK ("ends_at" > "starts_at");
