-- DropForeignKey
ALTER TABLE "public"."audit_log" DROP CONSTRAINT "audit_log_club_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."commissioner_delegation" DROP CONSTRAINT "commissioner_delegation_club_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."guardianship" DROP CONSTRAINT "guardianship_club_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."membership_assignment" DROP CONSTRAINT "membership_assignment_club_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."membership_category" DROP CONSTRAINT "membership_category_club_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."person" DROP CONSTRAINT "person_club_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."person_organization" DROP CONSTRAINT "person_organization_club_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."person_organization" DROP CONSTRAINT "person_organization_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."setting" DROP CONSTRAINT "setting_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."waiver_acceptance" DROP CONSTRAINT "waiver_acceptance_club_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."waiver_version" DROP CONSTRAINT "waiver_version_club_id_fkey";

