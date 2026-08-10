-- DropForeignKey
ALTER TABLE "public"."audit_log" DROP CONSTRAINT "audit_log_actor_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."audit_log" DROP CONSTRAINT "audit_log_on_behalf_of_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."waiver_acceptance" DROP CONSTRAINT "waiver_acceptance_accepted_by_person_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."waiver_acceptance" DROP CONSTRAINT "waiver_acceptance_person_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."waiver_acceptance" DROP CONSTRAINT "waiver_acceptance_waiver_version_id_fkey";

-- DropTable
DROP TABLE "public"."audit_log";

-- DropTable
DROP TABLE "public"."waiver_acceptance";

-- DropTable
DROP TABLE "public"."waiver_version";

