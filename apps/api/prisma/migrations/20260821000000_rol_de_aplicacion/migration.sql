-- T-007 · Rol de aplicación sin privilegios, y el append-only que no depende de él.
--
-- La constitución (P-07) pide que la auditoría sea append-only **a nivel de base de datos**. Hasta
-- ahora eso lo sostenía un disparador, con una nota escrita en la migración de `audit_log`: el
-- `REVOKE` no servía de nada porque la aplicación se conecta con el dueño de las tablas, y en
-- PostgreSQL el dueño y el superusuario **saltan toda comprobación de permisos**. Un `REVOKE`
-- contra ese rol es una garantía de mentira, que es peor que ninguna.
--
-- Esta migración cierra las dos mitades:
--
--   1. El disparador se extiende a `handicap_history`, que quedó con la misma promesa sin cumplir
--      (`specs/030` R-030-10). Un disparador se aplica a todo el mundo, dueño incluido.
--   2. Se crea el rol de aplicación, que **no** es dueño de nada, y ahí sí el `REVOKE` muerde.
--
-- Las dos capas son a propósito. El disparador protege aunque alguien se conecte como dueño —una
-- consola de emergencia, una migración mal escrita—; el rol protege aunque alguien borre el
-- disparador, porque borrarlo también es DDL y el rol tampoco puede.

-- ─── 1. Append-only, genérico ────────────────────────────────────────────────
--
-- La función de `audit_log` nombraba esa tabla en su mensaje. Se generaliza con `TG_TABLE_NAME`
-- para que sirva a las dos y a las que vengan, y se deja la vieja en su lugar: los disparadores
-- existentes la referencian por nombre, y cambiarlos aquí sería tocar algo que ya funciona.
CREATE OR REPLACE FUNCTION "tabla_append_only"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    '% es append-only: la operacion % no esta permitida', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Un registro mal escrito se corrige agregando una entrada nueva, nunca editando la anterior.';
END;
$$;

-- `handicap_history` es la fuente de verdad del handicap de cada jugador: el valor vigente es una
-- caché que se puede reconstruir desde aquí. Editar una fila de este historial no es corregir un
-- dato, es reescribir con cuánto estaba jugando alguien.
--
-- Los tres caminos, no dos: `TRUNCATE` **no** dispara los disparadores de `DELETE`.
CREATE TRIGGER "handicap_history_no_update"
  BEFORE UPDATE ON "handicap_history"
  FOR EACH STATEMENT EXECUTE FUNCTION "tabla_append_only"();

CREATE TRIGGER "handicap_history_no_delete"
  BEFORE DELETE ON "handicap_history"
  FOR EACH STATEMENT EXECUTE FUNCTION "tabla_append_only"();

CREATE TRIGGER "handicap_history_no_truncate"
  BEFORE TRUNCATE ON "handicap_history"
  FOR EACH STATEMENT EXECUTE FUNCTION "tabla_append_only"();

-- `audit_log` ya tiene sus tres disparadores desde su propia migración, con su propia función. No
-- se tocan: funcionan, y reescribirlos aquí sería cambiar algo que ya cumple para que se parezca a
-- lo nuevo. La función genérica queda para éste y los que vengan.

-- ─── 2. El rol de aplicación ─────────────────────────────────────────────────
--
-- Se crea **sin contraseña y sin LOGIN**: una contraseña en una migración es una contraseña en el
-- repositorio, y de ahí no sale nunca más. Quien despliega le pone la suya y le da LOGIN; el
-- procedimiento está en `docs/07` §4.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'polo_app') THEN
    CREATE ROLE "polo_app" NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA "public" TO "polo_app";

-- Sobre lo que ya existe.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "polo_app";

-- Y sobre lo que venga. **Ésta es la línea que hace que esto se pueda mantener**: sin ella, cada
-- tabla nueva nacería inaccesible para la aplicación y alguien tendría que acordarse de otorgarle
-- permisos en cada migración. Acordarse funciona hasta que no.
--
-- `current_user` y no un nombre fijo: el dueño de las tablas se llama distinto en cada entorno
-- —`polo` en el servidor, `test` en las pruebas— y las migraciones corren siempre como él.
DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    current_user, 'polo_app'
  );
END
$$;

-- ─── 3. Lo que el rol NO puede ───────────────────────────────────────────────
--
-- Aquí el `REVOKE` sí muerde, porque `polo_app` no es dueño de estas tablas.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM "polo_app";
REVOKE UPDATE, DELETE, TRUNCATE ON "handicap_history" FROM "polo_app";

-- **No hay forma de expresar esta excepción en los privilegios por defecto**: se aplican a todas
-- las tablas futuras y no admiten nombrar una. No hace falta: estas dos tablas ya existen y no se
-- van a recrear, así que el `REVOKE` de arriba vale para siempre.
--
-- Lo que sí hay que recordar es que **una tabla append-only nueva necesita su propio `REVOKE`**, y
-- por eso hay un test que recorre las tablas con disparador de append-only y comprueba que ninguna
-- le dejó permisos de escritura al rol de aplicación.
