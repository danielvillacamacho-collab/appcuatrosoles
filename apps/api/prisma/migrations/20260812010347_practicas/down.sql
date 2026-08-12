-- Revierte T-520.
--
-- El índice se va con la tabla; no hace falta borrarlo aparte. Los enums al final, cuando ya no
-- queda ninguna columna que los use.

DROP TABLE IF EXISTS "practice_application";
DROP TABLE IF EXISTS "practice_eligibility";
DROP TABLE IF EXISTS "practice";

DROP TYPE IF EXISTS "practice_outcome";
DROP TYPE IF EXISTS "practice_status";
