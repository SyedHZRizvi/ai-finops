-- CreateTable: AnomalyEvent — persistent record of detected anomalies
CREATE TABLE "AnomalyEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "metadata" TEXT,
    "webhookSent" BOOLEAN NOT NULL DEFAULT false,
    "scopeKey" TEXT,

    CONSTRAINT "AnomalyEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnomalyEvent_detectedAt_idx" ON "AnomalyEvent"("detectedAt");
CREATE INDEX "AnomalyEvent_severity_idx" ON "AnomalyEvent"("severity");
CREATE INDEX "AnomalyEvent_kind_scopeKey_idx" ON "AnomalyEvent"("kind", "scopeKey");
