-- Each booking owns an immutable contact snapshot. An anonymous caller must
-- never overwrite a prior customer's details by submitting the same email.
DROP INDEX "Customer_tenantId_email_key";
CREATE INDEX "Customer_tenantId_email_idx" ON "Customer"("tenantId", "email");
