ALTER TABLE "Tenant" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "PlatformAdmin" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE
);
-- Scalar actor/tenant identities deliberately retain audit history after account deletion.
CREATE TABLE "PlatformEvent" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "tenantId" TEXT,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "before" BOOLEAN,
  "after" BOOLEAN,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlatformEvent_createdAt_idx" ON "PlatformEvent"("createdAt");
