-- CreateEnum
CREATE TYPE "BuildStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "AgentAccount" ADD COLUMN     "gitTokenEnc" TEXT;

-- AlterTable
ALTER TABLE "LlmUsageLog" ADD COLUMN     "costEstimate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "WechatOutbox" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT;

-- CreateTable
CREATE TABLE "BuildRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "status" "BuildStatus" NOT NULL DEFAULT 'QUEUED',
    "requirementIds" TEXT[],
    "requestedBy" TEXT NOT NULL,
    "log" TEXT,
    "artifactPath" TEXT,
    "artifactName" TEXT,
    "artifactSize" INTEGER,
    "downloadToken" TEXT NOT NULL,
    "sentTo" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuildRun_downloadToken_key" ON "BuildRun"("downloadToken");

-- CreateIndex
CREATE INDEX "BuildRun_projectId_createdAt_idx" ON "BuildRun"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "BuildRun" ADD CONSTRAINT "BuildRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
