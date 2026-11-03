CREATE TABLE "ReminderPreference" (
  "organizationId" TEXT PRIMARY KEY REFERENCES "Organization"("id"),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "dayMode" TEXT NOT NULL DEFAULT 'FIRST',
  "day" INTEGER NOT NULL DEFAULT 1,
  "time" TEXT NOT NULL DEFAULT '09:00',
  "scope" TEXT NOT NULL DEFAULT 'ALL',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("dayMode" IN ('FIRST','LAST','SPECIFIC') AND "day" BETWEEN 1 AND 31 AND "scope" IN ('ALL','OVERDUE') AND "time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
CREATE TABLE "ReminderNotice" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "period" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "snoozedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ReminderNotice_organizationId_period_key" ON "ReminderNotice"("organizationId", "period");
CREATE TABLE "PushSubscription" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL UNIQUE,
  "keys" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PushJob" (
  "id" TEXT PRIMARY KEY,
  "subscriptionId" TEXT NOT NULL REFERENCES "PushSubscription"("id") ON DELETE CASCADE,
  "noticeId" TEXT NOT NULL REFERENCES "ReminderNotice"("id"),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  CHECK ("status" IN ('PENDING','SENT','SUPPRESSED','ATTENTION'))
);
CREATE UNIQUE INDEX "PushJob_subscriptionId_noticeId_key" ON "PushJob"("subscriptionId", "noticeId");
