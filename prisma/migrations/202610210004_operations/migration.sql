-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "BookingStatus" ADD VALUE 'NO_SHOW';

BEGIN;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "managementTokenHash" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "staffId" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "cancelCutoffMinutes" INTEGER NOT NULL DEFAULT 1440,
ADD COLUMN     "rescheduleCutoffMinutes" INTEGER NOT NULL DEFAULT 1440;

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMPTZ(3),
    "leaseToken" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "BookingEvent_tenantId_bookingId_createdAt_idx" ON "BookingEvent"("tenantId", "bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_status_availableAt_idx" ON "Notification"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_bookingId_kind_revision_key" ON "Notification"("bookingId", "kind", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_managementTokenHash_key" ON "Booking"("managementTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_tenantId_id_key" ON "Booking"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_staffId_key" ON "Membership"("tenantId", "staffId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_staffId_fkey" FOREIGN KEY ("tenantId", "staffId") REFERENCES "Staff"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_tenantId_bookingId_fkey" FOREIGN KEY ("tenantId", "bookingId") REFERENCES "Booking"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_bookingId_fkey" FOREIGN KEY ("tenantId", "bookingId") REFERENCES "Booking"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_cutoff_bounds" CHECK ("cancelCutoffMinutes" BETWEEN 0 AND 525600 AND "rescheduleCutoffMinutes" BETWEEN 0 AND 525600);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_revision_bounds" CHECK (revision >= 0);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_status_check" CHECK (status IN ('PENDING','PROCESSING','SENT','PREVIEWED','SKIPPED'));
CREATE FUNCTION booking_status_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> NEW.status AND OLD.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'Illegal booking status transition' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'CONFIRMED' AND (OLD."startAt", OLD."endAt", OLD."staffId", OLD."serviceId") IS DISTINCT FROM (NEW."startAt", NEW."endAt", NEW."staffId", NEW."serviceId") THEN
    RAISE EXCEPTION 'Terminal booking cannot be rescheduled' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER booking_status_transition BEFORE UPDATE ON "Booking" FOR EACH ROW EXECUTE FUNCTION booking_status_transition();

COMMIT;
