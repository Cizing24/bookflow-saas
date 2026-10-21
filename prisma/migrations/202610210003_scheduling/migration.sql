BEGIN;
ALTER TABLE "Tenant" ADD COLUMN "minNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "maxAdvanceDays" INTEGER NOT NULL DEFAULT 90,
 ADD COLUMN "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
 ADD CONSTRAINT "Tenant_scheduling_bounds" CHECK ("minNoticeMinutes" BETWEEN 0 AND 525600 AND "maxAdvanceDays" BETWEEN 1 AND 365 AND "slotIntervalMinutes" BETWEEN 5 AND 120);
ALTER TABLE "Service" ADD COLUMN "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
 ADD CONSTRAINT "Service_buffer_bounds" CHECK ("bufferBeforeMinutes" BETWEEN 0 AND 240 AND "bufferAfterMinutes" BETWEEN 0 AND 240);
ALTER TABLE "Staff" ADD COLUMN "customSchedule" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "StaffService" (
 "tenantId" TEXT NOT NULL, "staffId" TEXT NOT NULL, "serviceId" TEXT NOT NULL,
 PRIMARY KEY ("tenantId", "staffId", "serviceId"),
 FOREIGN KEY ("tenantId", "staffId") REFERENCES "Staff"("tenantId", id) ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("tenantId", "serviceId") REFERENCES "Service"("tenantId", id) ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "StaffService" SELECT s."tenantId", s.id, v.id FROM "Staff" s JOIN "Service" v ON v."tenantId" = s."tenantId";
CREATE TABLE "StaffSchedule" (
 id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "staffId" TEXT NOT NULL,
 weekday INTEGER NOT NULL, "openMinute" INTEGER NOT NULL, "closeMinute" INTEGER NOT NULL,
 kind TEXT NOT NULL DEFAULT 'WORK',
 FOREIGN KEY ("tenantId", "staffId") REFERENCES "Staff"("tenantId", id) ON DELETE CASCADE ON UPDATE CASCADE,
 CHECK (weekday BETWEEN 0 AND 6 AND "openMinute" >= 0 AND "closeMinute" <= 1440 AND "openMinute" < "closeMinute" AND kind IN ('WORK', 'BREAK'))
);
CREATE INDEX "StaffSchedule_tenantId_staffId_idx" ON "StaffSchedule"("tenantId", "staffId");
CREATE TABLE "StaffAbsence" (
 id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "staffId" TEXT NOT NULL,
 date VARCHAR(10) NOT NULL, "openMinute" INTEGER NOT NULL DEFAULT 0, "closeMinute" INTEGER NOT NULL DEFAULT 1440,
 reason TEXT NOT NULL DEFAULT '',
 FOREIGN KEY ("tenantId", "staffId") REFERENCES "Staff"("tenantId", id) ON DELETE CASCADE ON UPDATE CASCADE,
 CHECK (date ~ '^\d{4}-\d{2}-\d{2}$' AND "openMinute" >= 0 AND "closeMinute" <= 1440 AND "openMinute" < "closeMinute")
);
CREATE INDEX "StaffAbsence_tenantId_staffId_date_idx" ON "StaffAbsence"("tenantId", "staffId", date);
ALTER TABLE "Booking" ADD COLUMN "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "occupiedStartAt" TIMESTAMPTZ(3), ADD COLUMN "occupiedEndAt" TIMESTAMPTZ(3),
 ADD COLUMN "idempotencyKey" TEXT, ADD COLUMN "requestHash" TEXT,
 ADD CONSTRAINT "Booking_buffer_bounds" CHECK ("bufferBeforeMinutes" BETWEEN 0 AND 240 AND "bufferAfterMinutes" BETWEEN 0 AND 240);
CREATE UNIQUE INDEX "Booking_tenantId_idempotencyKey_key" ON "Booking"("tenantId", "idempotencyKey");
-- Trigger-owned endpoints cannot be forged by a writer. Buffers are booking snapshots.
CREATE FUNCTION booking_occupied_range() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW."occupiedStartAt" := NEW."startAt" - make_interval(mins => NEW."bufferBeforeMinutes");
 NEW."occupiedEndAt" := NEW."endAt" + make_interval(mins => NEW."bufferAfterMinutes");
 RETURN NEW;
END $$;
CREATE TRIGGER booking_occupied_range BEFORE INSERT OR UPDATE ON "Booking"
 FOR EACH ROW EXECUTE FUNCTION booking_occupied_range();
UPDATE "Booking" SET "occupiedStartAt" = "startAt", "occupiedEndAt" = "endAt";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_occupied_required" CHECK ("occupiedStartAt" IS NOT NULL AND "occupiedEndAt" IS NOT NULL);
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_no_overlap";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_overlap" EXCLUDE USING gist (
 "tenantId" WITH =, "staffId" WITH =, tstzrange("occupiedStartAt", "occupiedEndAt", '[)') WITH &&
) WHERE (status = 'CONFIRMED');
COMMIT;
