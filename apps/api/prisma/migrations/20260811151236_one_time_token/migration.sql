-- CreateEnum
CREATE TYPE "one_time_token_type" AS ENUM ('invitation', 'password_reset');

-- CreateTable
CREATE TABLE "one_time_token" (
    "id" TEXT NOT NULL,
    "user_account_id" TEXT NOT NULL,
    "type" "one_time_token_type" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "one_time_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "one_time_token_token_hash_key" ON "one_time_token"("token_hash");

-- CreateIndex
CREATE INDEX "one_time_token_user_account_id_type_used_at_idx" ON "one_time_token"("user_account_id", "type", "used_at");

-- AddForeignKey
ALTER TABLE "one_time_token" ADD CONSTRAINT "one_time_token_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
