-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SourceChannel" AS ENUM ('WECHAT', 'MANUAL', 'WEB_FORM', 'REALTIME');

-- CreateEnum
CREATE TYPE "Complexity" AS ENUM ('S', 'M', 'L');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "ReqStatus" AS ENUM ('INBOX', 'PARSING', 'PENDING_CONFIRM', 'READY', 'DEVELOPING', 'PENDING_TEST', 'TESTING', 'TESTED', 'REVIEWING', 'PENDING_ACCEPT', 'ACCEPTED', 'CLOSED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('POOL', 'CLAIMED', 'SUBMITTED', 'MERGED', 'CONFLICT', 'DONE');

-- CreateEnum
CREATE TYPE "ReportConclusion" AS ENUM ('PASS', 'FAIL', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AgentRole" AS ENUM ('DEVELOPER', 'TESTER', 'BOTH');

-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('ANTHROPIC_SDK', 'OPENAI_COMPAT');

-- CreateEnum
CREATE TYPE "ExpertRole" AS ENUM ('PRODUCT', 'PM', 'TEST');

-- CreateEnum
CREATE TYPE "WechatCaptureMode" AS ENUM ('ALL', 'MENTION', 'HASHTAG');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "mainBranch" TEXT NOT NULL DEFAULT 'main',
    "buildCommand" TEXT,
    "docsDir" TEXT NOT NULL DEFAULT 'docs',
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAccount" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AgentRole" NOT NULL,
    "projectIds" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "AgentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentToken" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AgentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL,
    "msgId" TEXT NOT NULL,
    "convId" TEXT NOT NULL,
    "convName" TEXT,
    "senderName" TEXT,
    "msgType" TEXT NOT NULL,
    "text" TEXT,
    "attachmentId" TEXT,
    "ts" TIMESTAMP(3) NOT NULL,
    "threadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementSource" (
    "id" TEXT NOT NULL,
    "channel" "SourceChannel" NOT NULL,
    "wechatConvId" TEXT,
    "senderName" TEXT,
    "customerName" TEXT,
    "threadId" TEXT NOT NULL,
    "rawMessages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "projectId" TEXT,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "userStory" TEXT NOT NULL,
    "acceptance" JSONB NOT NULL,
    "complexity" "Complexity" NOT NULL DEFAULT 'M',
    "moduleGuess" TEXT,
    "priority" "Priority",
    "priorityLocked" BOOLEAN NOT NULL DEFAULT false,
    "priorityReason" TEXT,
    "poolRank" INTEGER,
    "status" "ReqStatus" NOT NULL DEFAULT 'PENDING_CONFIRM',
    "clarifications" JSONB,
    "featureBranch" TEXT,
    "dailyBranchId" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqEvent" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReqEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevTask" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'POOL',
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "lastHeartbeat" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submitNote" TEXT,
    "selfTest" TEXT,
    "commits" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestTask" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "cases" JSONB NOT NULL,
    "tags" TEXT[],
    "priority" "Priority" NOT NULL DEFAULT 'P2',
    "status" "TaskStatus" NOT NULL DEFAULT 'POOL',
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "lastHeartbeat" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestReport" (
    "id" TEXT NOT NULL,
    "testTaskId" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "passRate" DOUBLE PRECISION NOT NULL,
    "conclusion" "ReportConclusion" NOT NULL,
    "defects" JSONB,
    "repoFilePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBranch" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mergedToMain" BOOLEAN NOT NULL DEFAULT false,
    "mergedAt" TIMESTAMP(3),
    "reviewSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WechatBinding" (
    "id" TEXT NOT NULL,
    "convId" TEXT NOT NULL,
    "convName" TEXT,
    "projectId" TEXT,
    "customerName" TEXT,
    "captureMode" "WechatCaptureMode" NOT NULL DEFAULT 'ALL',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WechatBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WechatOutbox" (
    "id" TEXT NOT NULL,
    "convId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "WechatOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProviderKind" NOT NULL,
    "baseUrl" TEXT,
    "apiKeyEnc" TEXT NOT NULL,
    "models" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRoleModelConfig" (
    "role" "ExpertRole" NOT NULL,
    "providerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "effort" TEXT,

    CONSTRAINT "AgentRoleModelConfig_pkey" PRIMARY KEY ("role")
);

-- CreateTable
CREATE TABLE "LlmUsageLog" (
    "id" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "expertRole" TEXT,
    "projectId" TEXT,
    "requirementId" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "content" JSONB NOT NULL,
    "pushed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAccount_username_key" ON "AgentAccount"("username");

-- CreateIndex
CREATE UNIQUE INDEX "AgentToken_tokenHash_key" ON "AgentToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentToken_agentId_idx" ON "AgentToken"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxMessage_msgId_key" ON "InboxMessage"("msgId");

-- CreateIndex
CREATE INDEX "InboxMessage_convId_threadedAt_idx" ON "InboxMessage"("convId", "threadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementSource_threadId_key" ON "RequirementSource"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_seq_key" ON "Requirement"("seq");

-- CreateIndex
CREATE INDEX "Requirement_projectId_status_idx" ON "Requirement"("projectId", "status");

-- CreateIndex
CREATE INDEX "ReqEvent_requirementId_idx" ON "ReqEvent"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "DevTask_requirementId_key" ON "DevTask"("requirementId");

-- CreateIndex
CREATE INDEX "DevTask_status_idx" ON "DevTask"("status");

-- CreateIndex
CREATE INDEX "TestTask_status_idx" ON "TestTask"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TestReport_testTaskId_key" ON "TestReport"("testTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBranch_projectId_name_key" ON "DailyBranch"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WechatBinding_convId_key" ON "WechatBinding"("convId");

-- CreateIndex
CREATE INDEX "WechatOutbox_sentAt_idx" ON "WechatOutbox"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "LlmProvider_name_key" ON "LlmProvider"("name");

-- CreateIndex
CREATE INDEX "LlmUsageLog_createdAt_idx" ON "LlmUsageLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_projectId_date_key" ON "DailyReport"("projectId", "date");

-- AddForeignKey
ALTER TABLE "AgentToken" ADD CONSTRAINT "AgentToken_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RequirementSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_dailyBranchId_fkey" FOREIGN KEY ("dailyBranchId") REFERENCES "DailyBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqEvent" ADD CONSTRAINT "ReqEvent_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RequirementSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevTask" ADD CONSTRAINT "DevTask_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevTask" ADD CONSTRAINT "DevTask_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "AgentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestTask" ADD CONSTRAINT "TestTask_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestTask" ADD CONSTRAINT "TestTask_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "AgentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestReport" ADD CONSTRAINT "TestReport_testTaskId_fkey" FOREIGN KEY ("testTaskId") REFERENCES "TestTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBranch" ADD CONSTRAINT "DailyBranch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WechatBinding" ADD CONSTRAINT "WechatBinding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

