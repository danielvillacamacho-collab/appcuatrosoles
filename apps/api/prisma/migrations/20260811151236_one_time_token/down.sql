-- DropForeignKey
ALTER TABLE "public"."one_time_token" DROP CONSTRAINT "one_time_token_user_account_id_fkey";

-- DropTable
DROP TABLE "public"."one_time_token";

-- DropEnum
DROP TYPE "public"."one_time_token_type";

