-- AlterTable: add `tags` to PromptLog (free-form user labels for slicing)
ALTER TABLE "PromptLog" ADD COLUMN "tags" TEXT;

-- CreateTable: Budget — monthly spend caps + optional alert webhooks
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeValue" TEXT,
    "monthlyLimit" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "alertAt75" BOOLEAN NOT NULL DEFAULT true,
    "alertAt90" BOOLEAN NOT NULL DEFAULT true,
    "alertAt100" BOOLEAN NOT NULL DEFAULT true,
    "webhookUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Budget_scope_scopeValue_key" ON "Budget"("scope", "scopeValue");
CREATE INDEX "Budget_scope_idx" ON "Budget"("scope");
CREATE INDEX "Budget_isActive_idx" ON "Budget"("isActive");
