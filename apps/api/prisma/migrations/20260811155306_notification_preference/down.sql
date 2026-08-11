-- DropForeignKey
ALTER TABLE "public"."notification_preference" DROP CONSTRAINT "notification_preference_user_account_id_fkey";

-- DropTable
DROP TABLE "public"."notification_preference";

