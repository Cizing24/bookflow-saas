import { changeBooking } from "@/modules/operations/service";
import { z } from "zod";
import { authorize, currentUser } from "@/modules/identity/authorization";
import {
  tenantSchema,
  serviceSchema,
  staffSchema,
  hoursSchema,
  scheduleSchema,
  policySchema,
} from "@/modules/shared/schemas";
import { tenantRepository } from "./repository";
export async function listTenants() {
  const user = await currentUser();
  return tenantRepository.memberships(user.id);
}
export async function createTenant(input: unknown) {
  const user = await currentUser();
  return tenantRepository.create(user.id, tenantSchema.parse(input));
}
export async function overview(tenantId: string) {
  const member = await authorize(tenantId);
  return {
    tenant: member.tenant,
    role: member.role,
    ...(await tenantRepository.overview(
      tenantId,
      member.role === "STAFF"
        ? (member.staffId ?? "__unassigned__")
        : undefined,
    )),
  };
}
export async function saveService(
  tenantId: string,
  input: unknown,
  id?: string,
) {
  await authorize(tenantId, true);
  return tenantRepository.saveService(tenantId, serviceSchema.parse(input), id);
}
export async function saveStaff(tenantId: string, input: unknown, id?: string) {
  await authorize(tenantId, true);
  return tenantRepository.saveStaff(tenantId, staffSchema.parse(input), id);
}
export async function saveHours(tenantId: string, input: unknown) {
  await authorize(tenantId, true);
  return tenantRepository.saveHours(tenantId, hoursSchema.parse(input));
}

export async function saveSchedule(tenantId: string, input: unknown) {
  await authorize(tenantId, true);
  return tenantRepository.saveSchedule(tenantId, scheduleSchema.parse(input));
}
export async function savePolicy(tenantId: string, input: unknown) {
  await authorize(tenantId, true);
  return tenantRepository.savePolicy(tenantId, policySchema.parse(input));
}
export async function cancelBooking(tenantId: string, input: unknown) {
  await authorize(tenantId, true);
  const { id } = z.object({ id: z.string().min(1) }).parse(input);
  return changeBooking(tenantId, { id, action: "CANCELLED" });
}
