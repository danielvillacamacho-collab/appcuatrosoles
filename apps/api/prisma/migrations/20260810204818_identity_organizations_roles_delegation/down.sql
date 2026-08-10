-- DropForeignKey
ALTER TABLE "public"."commissioner_delegation" DROP CONSTRAINT "commissioner_delegation_delegate_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."commissioner_delegation" DROP CONSTRAINT "commissioner_delegation_delegator_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."person_organization" DROP CONSTRAINT "person_organization_person_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."role_assignment" DROP CONSTRAINT "role_assignment_granted_by_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."role_assignment" DROP CONSTRAINT "role_assignment_revoked_by_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."role_assignment" DROP CONSTRAINT "role_assignment_user_account_id_fkey";

-- DropTable
DROP TABLE "public"."commissioner_delegation";

-- DropTable
DROP TABLE "public"."person_organization";

-- DropTable
DROP TABLE "public"."role_assignment";

-- DropEnum
DROP TYPE "public"."delegation_scope";

-- DropEnum
DROP TYPE "public"."org_relationship";

-- DropEnum
DROP TYPE "public"."role_name";

-- DropEnum
DROP TYPE "public"."scope_kind";

