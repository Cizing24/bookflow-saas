"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { platformOverview } from "@/modules/platform/service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
type Overview = Awaited<ReturnType<typeof platformOverview>>;
export function PlatformPanel() {
  const [data, setData] = useState<Overview>();
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => {
    let live = true;
    api<Overview>(`/api/platform?page=${page}`)
      .then((r) => {
        if (live) setData(r);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [page]);
  async function toggle(t: Overview["tenants"][number]) {
    setBusy(true);
    setError("");
    try {
      await api("/api/platform", "PATCH", {
        tenantId: t.id,
        active: !t.active,
        expectedActive: t.active,
        reason,
      });
      setData(await api<Overview>(`/api/platform?page=${page}`));
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
      <nav>
        <Link className="text-teal-700 underline" href="/dashboard">
          返回店家管理
        </Link>
      </nav>
      <h1 className="text-3xl font-bold">平台管理</h1>
      <p>
        平台權限獨立於店家角色。停用會關閉公開預約與店家管理；既有顧客仍可查看及取消預約。
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">
          {error ? "無法取得平台資料。請確認權限後重新載入。" : "載入中…"}
        </p>
      ) : (
        <>
          <section aria-label="平台統計" className="grid gap-4 sm:grid-cols-3">
            {[
              `店家總數：${data.total}`,
              `啟用店家：${data.active}`,
              `預約總數：${data.bookings}`,
            ].map((s) => (
              <Card className="p-5" key={s}>
                {s}
              </Card>
            ))}
          </section>
          <Card className="space-y-4 p-5">
            <h2 className="text-xl font-bold">所有店家</h2>
            <label>
              操作原因（至少 3 字，請勿填個資）
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
              />
            </label>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">店家狀態及操作</caption>
                <thead>
                  <tr>
                    {["店家", "Slug", "狀態", "預約數", "操作"].map((h) => (
                      <th className="p-3" scope="col" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.tenants.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="p-3">{t.name}</td>
                      <td className="p-3">{t.slug}</td>
                      <td className="p-3">{t.active ? "啟用" : "停用"}</td>
                      <td className="p-3">{t._count.bookings}</td>
                      <td className="p-3">
                        <Button
                          disabled={busy || reason.trim().length < 3}
                          onClick={() => toggle(t)}
                          aria-label={`${t.active ? "停用" : "啟用"} ${t.name}`}
                        >
                          {t.active ? "停用" : "啟用"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.tenants.length && <p>目前沒有店家。</p>}
            <nav aria-label="店家分頁" className="flex items-center gap-4">
              <Button
                disabled={busy || page === 1}
                onClick={() => setPage(page - 1)}
              >
                上一頁
              </Button>
              <span>第 {page} 頁</span>
              <Button
                disabled={busy || page * 25 >= data.total}
                onClick={() => setPage(page + 1)}
              >
                下一頁
              </Button>
            </nav>
          </Card>
          <Card className="space-y-3 p-5">
            <h2 className="text-xl font-bold">最近 50 筆平台稽核</h2>
            {!data.events.length && <p>尚無平台操作。</p>}
            {data.events.map((e) => (
              <p className="border-t pt-3 text-sm" key={e.id}>
                {new Date(e.createdAt).toISOString()} · {e.action} · 店家{" "}
                {e.tenantId ?? "—"} · 操作者 {e.actorId} · {e.reason}
              </p>
            ))}
          </Card>
        </>
      )}
    </main>
  );
}
