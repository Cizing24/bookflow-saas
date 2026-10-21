import { respond, sameOrigin } from "@/lib/http";
import { createTenant, listTenants } from "@/modules/tenant/service";
export async function GET() {
  return respond(listTenants);
}
export async function POST(r: Request) {
  return respond(async () => {
    sameOrigin(r);
    return createTenant(await r.json());
  });
}
