-- Revierte T-401.
--
-- **La extensión `btree_gist` NO se borra.** La usa también el EXCLUDE de temporadas de
-- `specs/020`, y quitarla aquí rompería ese módulo sin que nada en esta migración lo insinúe.

DROP TABLE IF EXISTS "field_booking";
DROP TABLE IF EXISTS "field";

DROP TYPE IF EXISTS "BookingVisibility";
DROP TYPE IF EXISTS "BookingType";
DROP TYPE IF EXISTS "FieldStatus";
