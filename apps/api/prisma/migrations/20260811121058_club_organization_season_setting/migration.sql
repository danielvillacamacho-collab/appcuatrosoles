-- CreateEnum
CREATE TYPE "club_status" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "organization_status" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "season_status" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "club" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "status" "club_status" NOT NULL DEFAULT 'active',
    "suspended_at" TIMESTAMPTZ(3),
    "suspended_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "organization_status" NOT NULL DEFAULT 'active',
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "season_status" NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "id" TEXT NOT NULL,
    "scope" "scope_kind" NOT NULL,
    "scope_id" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "club_slug_key" ON "club"("slug");

-- CreateIndex
CREATE INDEX "club_status_idx" ON "club"("status");

-- CreateIndex
CREATE INDEX "organization_club_id_status_idx" ON "organization"("club_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_club_id_name_key" ON "organization"("club_id", "name");

-- CreateIndex
CREATE INDEX "season_club_id_starts_on_idx" ON "season"("club_id", "starts_on");

-- CreateIndex
CREATE UNIQUE INDEX "season_club_id_name_key" ON "season"("club_id", "name");

-- CreateIndex
CREATE INDEX "setting_scope_scope_id_key_effective_from_idx" ON "setting"("scope", "scope_id", "key", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "setting_scope_scope_id_key_effective_from_key" ON "setting"("scope", "scope_id", "key", "effective_from");

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season" ADD CONSTRAINT "season_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariantes que Prisma no sabe expresar (P-09: la garantía vive en la base).
--
-- Todos podrían escribirse en el servicio, y todos se saltarían con un script, una migración
-- de datos o un `psql` a las 2 a.m. Aquí no.
-- ─────────────────────────────────────────────────────────────────────────────

-- El slug es la frontera de tenant: se resuelve desde el host de cada solicitud (ADR-013). Un
-- slug con mayúsculas, un punto o un espacio no falla ruidosamente — falla resolviendo a ningún
-- club, o peor, quedando inalcanzable después de que el club ya está operando. Se acota a lo que
-- es válido en una etiqueta de nombre de host, sin guion al principio ni al final.
ALTER TABLE "club"
  ADD CONSTRAINT "club_slug_formato"
  CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' AND length("slug") BETWEEN 2 AND 63);

-- Mismo invariante que en `role_assignment` (T-002), por la misma razón: `scope` + `scope_id` son
-- la frontera del valor. Un ajuste de plataforma con `scope_id`, o uno de club sin él, queda
-- invisible para la consulta que lo busca — presente en la tabla y sin efecto en el sistema, que
-- es la peor forma de estar mal.
ALTER TABLE "setting"
  ADD CONSTRAINT "setting_ambito_coherente"
  CHECK (("scope" = 'platform' AND "scope_id" IS NULL) OR ("scope" <> 'platform' AND "scope_id" IS NOT NULL));

-- El índice único que generó Prisma sobre (scope, scope_id, key, effective_from) **no protege el
-- ámbito de plataforma**: ahí `scope_id` es NULL, y PostgreSQL considera distintos dos NULL, así
-- que admitiría dos valores de plataforma para la misma clave y la misma vigencia — y entonces
-- «el valor vigente» deja de ser una respuesta y pasa a ser una lista. Es la misma propiedad de
-- los NULL que en T-005 jugaba a favor (dos personas sin correo), aquí en contra. Se cubre con un
-- índice parcial para las filas de plataforma.
CREATE UNIQUE INDEX "setting_platform_key_effective_from_key"
  ON "setting" ("key", "effective_from")
  WHERE "scope" = 'platform';

-- Una temporada que termina antes de empezar no es un dato raro: es un error de captura que
-- después nadie sabe interpretar al leer una estadística.
ALTER TABLE "season"
  ADD CONSTRAINT "season_fechas_coherentes"
  CHECK ("ends_on" >= "starts_on");

-- R-020-06: dos temporadas del mismo club no pueden solaparse. Es lo que hace que «la temporada
-- vigente» sea una respuesta y no una lista, y de eso dependen handicaps, estadísticas y copas.
--
-- Se hace con EXCLUDE y no con una comprobación en el servicio porque el servicio no puede
-- garantizarlo bajo concurrencia: dos solicitudes simultáneas leen «no hay solapamiento», y las
-- dos insertan. EXCLUDE es exactamente esta restricción, evaluada por el motor.
--
-- El rango es cerrado en ambos extremos ('[]'): el último día de la temporada todavía pertenece a
-- ella, igual que el `ends_on` de un `guardianship` (ver T-014). Con el rango semiabierto por
-- defecto, dos temporadas que compartieran el día de cierre pasarían sin ser detectadas.
--
-- `btree_gist` es lo que permite mezclar la igualdad de `club_id` (tipo text) con el solapamiento
-- del rango dentro del mismo índice. Se instala aquí y se reutilizará en specs/050: una cancha
-- tampoco puede tener dos prácticas solapadas.
--
-- Nota sobre el rollback: el `down.sql` **no** elimina esta extensión, y es deliberado.
-- `DROP EXTENSION` falla si algún objeto todavía depende de ella —en cuanto specs/050 agregue el
-- EXCLUDE de canchas habrá uno— y forzarlo con CASCADE borraría esa restricción sin avisar.
-- Instalarla es idempotente y no cuesta nada mantenerla: revertir esta migración deja la
-- extensión, no las tablas. (La nota vive aquí y no en `down.sql` porque ese archivo se
-- regenera con `pnpm db:down-sql` y se llevaría el comentario por delante.)
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "season"
  ADD CONSTRAINT "season_sin_solapamiento"
  EXCLUDE USING gist (
    "club_id" WITH =,
    daterange("starts_on", "ends_on", '[]') WITH &&
  );
