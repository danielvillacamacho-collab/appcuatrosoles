-- Revierte T-320.
--
-- El orden importa: primero las tablas que apuntan a otras. El enum va al final, porque las
-- columnas que lo usan tienen que haber desaparecido antes.

DROP TABLE IF EXISTS "handicap_history";
DROP TABLE IF EXISTS "player_handicap";

DROP TYPE IF EXISTS "HandicapType";
