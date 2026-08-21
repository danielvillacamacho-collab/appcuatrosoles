-- Revierte T-007.
--
-- El rol se borra al final: mientras tenga privilegios otorgados, PostgreSQL se niega a eliminarlo.

DROP TRIGGER IF EXISTS "handicap_history_no_update" ON "handicap_history";
DROP TRIGGER IF EXISTS "handicap_history_no_delete" ON "handicap_history";
DROP TRIGGER IF EXISTS "handicap_history_no_truncate" ON "handicap_history";
DROP FUNCTION IF EXISTS "tabla_append_only"();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'polo_app') THEN
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM polo_app', current_user);
    REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "polo_app";
    REVOKE USAGE ON SCHEMA "public" FROM "polo_app";
    DROP ROLE "polo_app";
  END IF;
END
$$;
