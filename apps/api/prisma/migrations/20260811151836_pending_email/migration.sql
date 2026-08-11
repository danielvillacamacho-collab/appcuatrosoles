-- AlterEnum
ALTER TYPE "one_time_token_type" ADD VALUE 'email_change';

-- AlterTable
ALTER TABLE "user_account" ADD COLUMN     "pending_email" TEXT;
