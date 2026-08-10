-- DropForeignKey
ALTER TABLE "public"."session" DROP CONSTRAINT "session_user_account_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_account" DROP CONSTRAINT "user_account_person_id_fkey";

-- DropTable
DROP TABLE "public"."person";

-- DropTable
DROP TABLE "public"."session";

-- DropTable
DROP TABLE "public"."user_account";

-- DropEnum
DROP TYPE "public"."person_status";

-- DropEnum
DROP TYPE "public"."user_account_status";

