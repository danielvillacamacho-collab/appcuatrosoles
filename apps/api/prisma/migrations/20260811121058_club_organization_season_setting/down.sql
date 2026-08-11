-- DropForeignKey
ALTER TABLE "public"."organization" DROP CONSTRAINT "organization_club_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."season" DROP CONSTRAINT "season_club_id_fkey";

-- DropTable
DROP TABLE "public"."club";

-- DropTable
DROP TABLE "public"."organization";

-- DropTable
DROP TABLE "public"."season";

-- DropTable
DROP TABLE "public"."setting";

-- DropEnum
DROP TYPE "public"."club_status";

-- DropEnum
DROP TYPE "public"."organization_status";

-- DropEnum
DROP TYPE "public"."season_status";

