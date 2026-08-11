-- ─────────────────────────────────────────────────────────────────────────────
-- T-202 · Las llaves foráneas que specs/010 dejó anotadas como deuda en schema.prisma.
--
-- ESTA MIGRACIÓN NO ES SÓLO ESQUEMA: primero repara los datos. Hasta hoy `club_id` era texto
-- libre, así que el seed, los tests y cualquier prueba manual inventaron identificadores sin
-- que nada los validara. Agregar la restricción sin más falla en cualquier base con datos —y
-- falla en el peor momento, a mitad de un despliegue, dejando la migración a medias.
--
-- Qué se hace con un `club_id` huérfano: se **crea el club que falta**, conservando su
-- identificador. No se borran filas (P-06: nada se borra) y, sobre todo, **no se actualiza
-- ninguna fila hija** — que es lo que permite que `audit_log` participe de esto (ver abajo).
--
-- El club creado queda `suspended` y con un slug generado, no adivinado. Las dos cosas son
-- deliberadas: de un club cuyo origen no podemos verificar no queremos que quede accesible por
-- subdominio en cuanto exista el TenantGuard (T-221). Si alguno de estos clubes es real, se
-- reactiva a mano o lo corrige el arranque (T-232); el seed de desarrollo lo hace en T-203.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  huerfano RECORD;
  creados INT := 0;
BEGIN
  FOR huerfano IN
    SELECT DISTINCT club_id FROM (
      SELECT club_id FROM "person"
      UNION SELECT club_id FROM "person_organization"
      UNION SELECT club_id FROM "commissioner_delegation"
      UNION SELECT club_id FROM "membership_category"
      UNION SELECT club_id FROM "membership_assignment"
      UNION SELECT club_id FROM "guardianship"
      UNION SELECT club_id FROM "waiver_version"
      UNION SELECT club_id FROM "waiver_acceptance"
      UNION SELECT club_id FROM "audit_log" WHERE club_id IS NOT NULL
    ) AS referencias
    WHERE club_id NOT IN (SELECT id FROM "club")
  LOOP
    INSERT INTO "club" ("id", "slug", "name", "status", "suspended_at", "suspended_reason",
                        "created_at", "updated_at")
    VALUES (
      huerfano.club_id,
      -- El slug NO se deriva del identificador: uno viejo puede tener cualquier forma (en esta
      -- base había uno de un solo carácter) y no cumpliría el CHECK de formato de T-201.
      'migrado-' || substr(md5(huerfano.club_id), 1, 12),
      'Club migrado (' || huerfano.club_id || ')',
      'suspended',
      now(),
      'Creado por la migración T-202 a partir de datos previos a la tabla club. Revisar y renombrar.',
      now(),
      now()
    );
    creados := creados + 1;
  END LOOP;

  IF creados > 0 THEN
    RAISE NOTICE 'T-202: se crearon % club(es) suspendidos para datos huérfanos. Revisalos.', creados;
  END IF;
END $$;

-- Lo mismo para las organizaciones: `person_organization.organization_id` también era texto libre.
DO $$
DECLARE
  huerfana RECORD;
BEGIN
  FOR huerfana IN
    SELECT DISTINCT club_id, organization_id
    FROM "person_organization"
    WHERE organization_id NOT IN (SELECT id FROM "organization")
  LOOP
    INSERT INTO "organization" ("id", "club_id", "name", "type", "status", "archived_at",
                                "created_at", "updated_at")
    VALUES (
      huerfana.organization_id,
      huerfana.club_id,
      'Organización migrada (' || huerfana.organization_id || ')',
      'service',
      'archived',
      now(),
      now(),
      now()
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- `audit_log` SÍ lleva su llave foránea, y conviene dejar escrito por qué se puede.
--
-- La tabla es append-only con triggers (T-004): rechaza UPDATE, DELETE y TRUNCATE para todo el
-- mundo, superusuario incluido. `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` no es ninguna
-- de esas tres: valida las filas existentes **leyéndolas**, y a partir de ahí sólo condiciona
-- inserciones futuras. Por eso funciona — y por eso la reparación de arriba crea clubes en vez
-- de corregir filas: un UPDATE sobre `audit_log` habría hecho fallar la migración entera.
--
-- Que la lleve importa: una entrada de auditoría que apunta a un club inexistente es un rastro
-- que no se puede leer, y esta tabla existe justamente para ser leída meses después.
--
-- Sobre el rollback: el `down.sql` quita las restricciones y **no** borra los clubes que esta
-- migración haya creado. Es deliberado (P-06: nada se borra). Revertir el esquema no puede
-- llevarse por delante filas que, para cuando alguien revierta, quizá ya tengan datos colgando.
-- ─────────────────────────────────────────────────────────────────────────────

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_organization" ADD CONSTRAINT "person_organization_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_organization" ADD CONSTRAINT "person_organization_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioner_delegation" ADD CONSTRAINT "commissioner_delegation_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_category" ADD CONSTRAINT "membership_category_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_assignment" ADD CONSTRAINT "membership_assignment_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardianship" ADD CONSTRAINT "guardianship_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_version" ADD CONSTRAINT "waiver_version_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_acceptance" ADD CONSTRAINT "waiver_acceptance_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
