-- Revierte T-711.
--
-- Las tablas primero; el enum al final, que es la parte que no es trivial: PostgreSQL **no tiene
-- `DROP VALUE`** para un enum, así que quitar `played` obliga a recrear el tipo entero y a
-- reescribir la columna que lo usa.

DROP TABLE IF EXISTS "chukker_grid_cell";
DROP TABLE IF EXISTS "practice_result";

ALTER TABLE "practice" DROP COLUMN IF EXISTS "closed_at";
ALTER TABLE "practice" DROP COLUMN IF EXISTS "closed_by_id";

-- Una práctica cerrada vuelve a estar confirmada: el estado al que se la revierte es el que tenía
-- antes de cerrarse, y sin este paso el cast de abajo falla con esas filas.
UPDATE "practice" SET "status" = 'confirmed' WHERE "status" = 'played';

-- El baile del enum. El `DROP DEFAULT` es obligatorio: el valor por omisión es del tipo viejo y no
-- se puede convertir mientras siga colgado de la columna.
ALTER TABLE "practice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "practice_status" RENAME TO "practice_status_old";
CREATE TYPE "practice_status" AS ENUM ('draft', 'published', 'confirmed', 'cancelled');
ALTER TABLE "practice"
  ALTER COLUMN "status" TYPE "practice_status" USING "status"::text::"practice_status";
ALTER TABLE "practice" ALTER COLUMN "status" SET DEFAULT 'draft';
DROP TYPE "practice_status_old";
