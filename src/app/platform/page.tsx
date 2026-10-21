import { redirect } from "next/navigation";
import Link from "next/link";
import { platformAccess } from "@/modules/platform/service";
import { PlatformPanel } from "@/components/platform-panel";
import { AppError } from "@/modules/shared/errors";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await platformAccess();
  } catch (e) {
    if (e instanceof AppError && e.status === 401) redirect("/login");
    if (e instanceof AppError && e.status === 403)
      return (
        <main className="mx-auto max-w-xl p-10">
          <h1 className="text-2xl font-bold">無平台管理權限</h1>
          <p>請聯絡平台營運者。店家 Owner 不會自動取得平台權限。</p>
          <Link href="/dashboard">返回店家管理</Link>
        </main>
      );
    throw e;
  }
  return <PlatformPanel />;
}
