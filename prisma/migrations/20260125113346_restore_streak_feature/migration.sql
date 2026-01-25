-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "loginStreak" INTEGER NOT NULL DEFAULT 0;
