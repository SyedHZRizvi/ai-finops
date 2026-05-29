-- ApiKey
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopeApps" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT,
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApiKey_hashedKey_key" ON "ApiKey"("hashedKey");
CREATE INDEX "ApiKey_isActive_idx" ON "ApiKey"("isActive");
CREATE INDEX "ApiKey_lastUsedAt_idx" ON "ApiKey"("lastUsedAt");

-- PromptAnnotation
CREATE TABLE "PromptAnnotation" (
    "id" TEXT NOT NULL,
    "promptLogId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    CONSTRAINT "PromptAnnotation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PromptAnnotation_promptLogId_idx" ON "PromptAnnotation"("promptLogId");
CREATE INDEX "PromptAnnotation_status_idx" ON "PromptAnnotation"("status");

-- AllocationRule
CREATE TABLE "AllocationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceMatcher" TEXT NOT NULL,
    "targetSplit" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AllocationRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AllocationRule_isActive_priority_idx" ON "AllocationRule"("isActive", "priority");
