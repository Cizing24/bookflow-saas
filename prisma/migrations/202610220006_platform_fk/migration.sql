-- Align the platform relationship with Prisma's ON UPDATE CASCADE contract.
-- Keep the already-applied fifth migration immutable.
ALTER TABLE "PlatformAdmin" DROP CONSTRAINT "PlatformAdmin_userId_fkey";
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
