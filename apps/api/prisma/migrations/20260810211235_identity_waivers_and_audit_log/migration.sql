-- CreateTable
CREATE TABLE "waiver_version" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waiver_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiver_acceptance" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "accepted_by_person_id" TEXT NOT NULL,
    "waiver_version_id" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_hash" TEXT,

    CONSTRAINT "waiver_acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "club_id" TEXT,
    "actor_user_id" TEXT,
    "on_behalf_of_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waiver_version_club_id_published_at_idx" ON "waiver_version"("club_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "waiver_version_club_id_version_key" ON "waiver_version"("club_id", "version");

-- CreateIndex
CREATE INDEX "waiver_acceptance_club_id_person_id_idx" ON "waiver_acceptance"("club_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "waiver_acceptance_person_id_waiver_version_id_key" ON "waiver_acceptance"("person_id", "waiver_version_id");

-- CreateIndex
CREATE INDEX "audit_log_club_id_entity_type_entity_id_idx" ON "audit_log"("club_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_occurred_at_idx" ON "audit_log"("actor_user_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "waiver_acceptance" ADD CONSTRAINT "waiver_acceptance_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_acceptance" ADD CONSTRAINT "waiver_acceptance_accepted_by_person_id_fkey" FOREIGN KEY ("accepted_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_acceptance" ADD CONSTRAINT "waiver_acceptance_waiver_version_id_fkey" FOREIGN KEY ("waiver_version_id") REFERENCES "waiver_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_on_behalf_of_id_fkey" FOREIGN KEY ("on_behalf_of_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- P-07 · La auditoría es append-only. Y esto es lo que lo hace verdad.
--
-- Por qué un TRIGGER y no sólo `REVOKE UPDATE, DELETE`: hoy la aplicación se conecta con un
-- rol que es **superusuario y dueño de la tabla**, y en PostgreSQL tanto el superusuario como
-- el dueño saltan toda comprobación de permisos. Un REVOKE contra ese rol no haría
-- absolutamente nada — daría una falsa sensación de garantía, que es peor que no tenerla.
-- Un trigger, en cambio, se aplica a todo el mundo, superusuario incluido.
--
-- El REVOKE sigue siendo necesario como segunda capa (defensa en profundidad), pero exige
-- crear un rol de aplicación sin privilegios, lo que toca docker-compose, el .env, el
-- despliegue y el CI. Va como tarea propia: T-007 en tasks.md.
--
-- Se cubren los tres caminos, no dos: TRUNCATE **no** dispara los triggers de DELETE, así que
-- sin la tercera línea `TRUNCATE audit_log` borraría la auditoría entera sin encontrar
-- resistencia — que es exactamente cómo se pierde un registro de auditoría.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "audit_log_append_only"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'audit_log es append-only: la operacion % no esta permitida (constitution P-07)', TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Un registro de auditoria mal escrito se corrige agregando una entrada nueva, nunca editando la anterior.';
END;
$$;

CREATE TRIGGER "audit_log_no_update"
  BEFORE UPDATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"();

CREATE TRIGGER "audit_log_no_delete"
  BEFORE DELETE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"();

CREATE TRIGGER "audit_log_no_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"();

-- Una aceptación de waiver no se acepta «en nombre de» sí misma por error de datos: si
-- `accepted_by` es otra persona, es porque hay un acudiente detrás. No se restringe que sean
-- iguales (el caso normal es que una persona adulta acepte por sí misma).

-- La versión de un waiver es correlativa y positiva.
ALTER TABLE "waiver_version"
  ADD CONSTRAINT "waiver_version_positive" CHECK ("version" > 0);
