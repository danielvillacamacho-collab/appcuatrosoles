-- DropForeignKey
ALTER TABLE "public"."guardianship" DROP CONSTRAINT "guardianship_dependent_person_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."guardianship" DROP CONSTRAINT "guardianship_guardian_person_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."membership_assignment" DROP CONSTRAINT "membership_assignment_assigned_by_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."membership_assignment" DROP CONSTRAINT "membership_assignment_membership_category_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."membership_assignment" DROP CONSTRAINT "membership_assignment_person_id_fkey";

-- DropTable
DROP TABLE "public"."guardianship";

-- DropTable
DROP TABLE "public"."membership_assignment";

-- DropTable
DROP TABLE "public"."membership_category";

