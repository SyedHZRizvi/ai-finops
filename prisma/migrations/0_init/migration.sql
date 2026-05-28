-- CreateTable
CREATE TABLE "PromptLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appName" TEXT,
    "userId" TEXT,
    "model" TEXT NOT NULL,
    "provider" TEXT,
    "promptText" TEXT NOT NULL,
    "responseText" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "inputCost" DOUBLE PRECISION NOT NULL,
    "outputCost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "complexity" TEXT NOT NULL,
    "complexityScore" DOUBLE PRECISION NOT NULL,
    "dimensions" TEXT NOT NULL,
    "characteristics" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "metadata" TEXT,
    "potentialSavedTokens" INTEGER NOT NULL DEFAULT 0,
    "potentialSavedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "callCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PromptLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPricingConfig" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT,
    "inputCostPer1M" DOUBLE PRECISION NOT NULL,
    "outputCostPer1M" DOUBLE PRECISION NOT NULL,
    "cacheReadCostPer1M" DOUBLE PRECISION,
    "cacheWriteCostPer1M" DOUBLE PRECISION,
    "contextWindow" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationLog" (
    "id" TEXT NOT NULL,
    "promptLogId" TEXT,
    "originalPrompt" TEXT NOT NULL,
    "optimizedPrompt" TEXT NOT NULL,
    "originalTokens" INTEGER NOT NULL,
    "optimizedTokens" INTEGER NOT NULL,
    "savedTokens" INTEGER NOT NULL,
    "savedCost" DOUBLE PRECISION NOT NULL,
    "suggestions" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptimizationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT,
    "encryptedBlob" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "recordsImported" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "rangeFrom" TIMESTAMP(3),
    "rangeTo" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromptLog_timestamp_idx" ON "PromptLog"("timestamp");

-- CreateIndex
CREATE INDEX "PromptLog_category_idx" ON "PromptLog"("category");

-- CreateIndex
CREATE INDEX "PromptLog_complexity_idx" ON "PromptLog"("complexity");

-- CreateIndex
CREATE INDEX "PromptLog_model_idx" ON "PromptLog"("model");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPricingConfig_model_key" ON "ModelPricingConfig"("model");

-- CreateIndex
CREATE INDEX "Credential_provider_idx" ON "Credential"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_provider_label_key" ON "Credential"("provider", "label");

-- CreateIndex
CREATE INDEX "ImportJob_provider_idx" ON "ImportJob"("provider");

-- CreateIndex
CREATE INDEX "ImportJob_status_idx" ON "ImportJob"("status");

-- CreateIndex
CREATE INDEX "ImportJob_startedAt_idx" ON "ImportJob"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

