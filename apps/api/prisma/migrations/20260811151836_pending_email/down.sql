-- AlterEnum
BEGIN;
CREATE TYPE "public"."one_time_token_type_new" AS ENUM ('invitation', 'password_reset');
ALTER TABLE "public"."one_time_token" ALTER COLUMN "type" TYPE "public"."one_time_token_type_new" USING ("type"::text::"public"."one_time_token_type_new");
ALTER TYPE "public"."one_time_token_type" RENAME TO "one_time_token_type_old";
ALTER TYPE "public"."one_time_token_type_new" RENAME TO "one_time_token_type";
DROP TYPE "public"."one_time_token_type_old";
COMMIT;

-- AlterTable
ALTER TABLE "public"."user_account" DROP COLUMN "pending_email";

