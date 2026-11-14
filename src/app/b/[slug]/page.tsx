import { notFound } from "next/navigation";
import { publicTenant } from "@/modules/booking/repository";
import { BookingForm } from "@/components/booking-form";
import { isPublicDemo } from "@/lib/demo";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const tenant = await publicTenant((await params).slug);
  if (!tenant) notFound();
  return (
    <BookingForm
      demoMode={isPublicDemo()}
      tenant={{
        name: tenant.name,
        slug: tenant.slug,
        timezone: tenant.timezone,
        maxAdvanceDays: tenant.maxAdvanceDays,
        services: tenant.services,
        staff: tenant.staff,
      }}
    />
  );
}
