ALTER TABLE "PushSubscription" ADD COLUMN "vapidPublicKey" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "lastTestAt" TIMESTAMP(3);
CREATE INDEX "PushSubscription_organizationId_userId_idx" ON "PushSubscription"("organizationId", "userId");
