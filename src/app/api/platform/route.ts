import { respond, sameOrigin, readJson } from "@/lib/http";
import { platformOverview, setTenantActive } from "@/modules/platform/service";
export async function GET(r: Request) {
  return respond(() =>
    platformOverview(Object.fromEntries(new URL(r.url).searchParams)),
  );
}
export async function PATCH(r: Request) {
  return respond(async () => {
    sameOrigin(r);
    return setTenantActive(await readJson(r));
  });
}
