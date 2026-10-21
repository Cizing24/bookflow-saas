import { authorize, currentUser } from "@/modules/identity/authorization";
import {
  tenantSchema,
  serviceSchema,
  staffSchema,
  hoursSchema,
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
    ...(await tenantRepository.overview(tenantId)),
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
