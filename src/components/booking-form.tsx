"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { CalendarDays, Clock, Check, ArrowRight, MapPin } from "lucide-react";
import { api } from "@/lib/client-api";
import { useHydrated } from "@/lib/use-hydrated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
type Tenant = {
  name: string;
  slug: string;
  timezone: string;
  services: {
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  }[];
  maxAdvanceDays: number;
  staff: { id: string; name: string; services: { serviceId: string }[] }[];
};
export function BookingForm({ tenant }: { tenant: Tenant }) {
  const hydrated = useHydrated();
  const [serviceId, setServiceId] = useState(tenant.services[0]?.id ?? "");
  const [staffId, setStaffId] = useState(
    tenant.staff.find((s) =>
      s.services.some((v) => v.serviceId === tenant.services[0]?.id),
    )?.id ?? "",
  );
  const [date, setDate] = useState(
    DateTime.now().setZone(tenant.timezone).plus({ days: 1 }).toISODate()!,
  );
  const submission = useRef<{ fingerprint: string; key: string } | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [startAt, setStartAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    id: string;
    startAt: string;
    endAt: string;
    serviceName: string;
    price: number;
    status: "CONFIRMED" | "CANCELLED";
  } | null>(null);
  const service = tenant.services.find((s) => s.id === serviceId);
  useEffect(() => {
    if (!serviceId || !staffId) return;
    let active = true;
    api<{ dates: string[] }>(
      `/api/public/${tenant.slug}/dates?` +
        new URLSearchParams({ serviceId, staffId }),
    )
      .then((data) => {
        if (active) setDates(data.dates);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [serviceId, staffId, tenant.slug, retry]);
  useEffect(() => {
    if (!serviceId || !staffId || !date) return;
    let active = true;
    api<{ slots: string[] }>(
      "/api/public/" +
        tenant.slug +
        "/slots?" +
        new URLSearchParams({ serviceId, staffId, date }),
    )
      .then((data) => {
        if (active) setSlots(data.slots);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [serviceId, staffId, date, tenant.slug, retry]);
  function resetSlots() {
    setLoading(true);
    setError("");
    setStartAt("");
    setSlots([]);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const payload = {
      serviceId,
      staffId,
      startAt,
      name: f.get("name"),
      email: f.get("email"),
      phone: f.get("phone"),
    };
    const fingerprint = JSON.stringify(payload);
    if (submission.current?.fingerprint !== fingerprint)
      submission.current = { fingerprint, key: crypto.randomUUID() };
    try {
      setResult(
        await api("/api/public/" + tenant.slug + "/bookings", "POST", {
          ...payload,
          idempotencyKey: submission.current.key,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      // Keep the exact request and key available for a network retry.
      // The backend revalidates conflicts; explicitly refreshing clears selection.
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#f5f7f6]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold">
            <CalendarDays className="text-teal-700" />
            BookFlow
          </Link>
          <span className="text-xs text-slate-500">安心預約 · 即時確認</span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-10 lg:py-14">
        <p className="text-xs font-bold tracking-[.2em] text-teal-700">
          MAKE TIME FOR YOURSELF
        </p>
        <h1 className="mt-4 text-3xl font-bold lg:text-4xl">{tenant.name}</h1>
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
          <MapPin size={15} />
          {tenant.timezone} <span className="mx-1">·</span>{" "}
          所有時段依店家當地時間顯示
        </p>
        {result ? (
          <Card className="mx-auto mt-10 max-w-xl p-8 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <Check size={30} />
            </span>
            <h2 className="mt-5 text-2xl font-bold">
              {result.status === "CANCELLED" ? "預約已取消" : "預約成功！"}
            </h2>
            <p className="mt-3 text-slate-500">
              {result.status === "CANCELLED"
                ? "店家已取消這筆預約，時段已釋放。你可以另約一次。"
                : "我們已為你保留這段時間。"}
            </p>
            <div className="my-7 space-y-3 rounded-xl bg-slate-50 p-5 text-left text-sm">
              <p>服務：{result.serviceName}</p>
              <p>人員：{tenant.staff.find((s) => s.id === staffId)?.name}</p>
              <p>
                時間：
                {DateTime.fromISO(result.startAt)
                  .setZone(tenant.timezone)
                  .toFormat("yyyy/MM/dd HH:mm ZZ")}
                –
                {DateTime.fromISO(result.endAt)
                  .setZone(tenant.timezone)
                  .toFormat("HH:mm ZZ")}
              </p>
              <p>費用：NT$ {result.price.toLocaleString()}</p>
              <p className="break-all text-xs text-slate-400">
                預約編號：{result.id}
              </p>
            </div>
            <p className="mb-6 text-xs leading-6 text-slate-500">
              請保存此畫面。如需變更或取消，請直接聯絡店家。本階段尚未提供 Email
              通知。
            </p>
            <Button
              onClick={() => {
                submission.current = null;
                setResult(null);
                setStartAt("");
                resetSlots();
                setRetry((v) => v + 1);
              }}
            >
              再預約一次
            </Button>
          </Card>
        ) : !tenant.services.length || !tenant.staff.length ? (
          <Card className="mt-10 py-16 text-center">
            <CalendarDays className="mx-auto mb-4 text-slate-300" size={36} />
            <h2 className="text-xl font-bold">店家準備中</h2>
            <p className="mt-3 text-slate-500">
              目前尚未開放預約，請稍後再回來。
            </p>
          </Card>
        ) : (
          <form
            onSubmit={submit}
            className="mt-10 grid items-start gap-6 lg:grid-cols-[1fr_300px]"
          >
            <fieldset disabled={!hydrated || busy} className="contents">
              <div className="space-y-6">
                <Card>
                  <Step n="01" title="選擇服務與人員" />
                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    <label>
                      服務項目
                      <select
                        aria-label="服務項目"
                        value={serviceId}
                        onChange={(e) => {
                          resetSlots();
                          setServiceId(e.target.value);
                          setDates([]);
                          setStaffId(
                            tenant.staff.find((s) =>
                              s.services.some(
                                (v) => v.serviceId === e.target.value,
                              ),
                            )?.id ?? "",
                          );
                        }}
                      >
                        {tenant.services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {s.durationMinutes} 分鐘
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      服務人員
                      <select
                        aria-label="服務人員"
                        value={staffId}
                        onChange={(e) => {
                          resetSlots();
                          setStaffId(e.target.value);
                        }}
                      >
                        {!staffId && (
                          <option value="">目前沒有可提供此服務的人員</option>
                        )}
                        {tenant.staff
                          .filter((s) =>
                            s.services.some((v) => v.serviceId === serviceId),
                          )
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                </Card>
                <Card>
                  <Step n="02" title="找到適合你的時間" />
                  <label className="mt-6 max-w-xs">
                    預約日期
                    <Input
                      type="date"
                      required
                      value={date}
                      min={DateTime.now().setZone(tenant.timezone).toISODate()!}
                      max={DateTime.now()
                        .setZone(tenant.timezone)
                        .plus({ days: tenant.maxAdvanceDays })
                        .toISODate()!}
                      onChange={(e) => {
                        resetSlots();
                        setDate(e.target.value);
                      }}
                    />
                  </label>
                  <div className="mt-4">
                    <p className="text-xs text-slate-500">
                      可預約日期（後端即時計算）
                    </p>
                    <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-auto">
                      {dates.map((d) => (
                        <button
                          type="button"
                          key={d}
                          aria-pressed={date === d}
                          className="rounded border px-3 py-2 text-sm"
                          onClick={() => {
                            resetSlots();
                            setDate(d);
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="mt-5 text-xs text-slate-500">可預約時段</p>
                  {!staffId ? (
                    <p className="my-6 text-sm text-slate-500">
                      目前沒有可提供此服務的人員。
                    </p>
                  ) : loading ? (
                    <p role="status" className="py-8 text-sm text-slate-500">
                      正在查詢可用時段…
                    </p>
                  ) : slots.length ? (
                    <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {slots.map((s) => (
                        <button
                          aria-pressed={startAt === s}
                          type="button"
                          key={s}
                          onClick={() => setStartAt(s)}
                          className={
                            "rounded-lg border px-2 py-3 text-sm font-semibold " +
                            (startAt === s
                              ? "border-teal-700 bg-teal-700 text-white"
                              : "border-slate-200 hover:border-teal-600")
                          }
                        >
                          {DateTime.fromISO(s)
                            .setZone(tenant.timezone)
                            .toFormat("HH:mm ZZ")}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="my-6 rounded-lg bg-slate-50 p-5 text-sm text-slate-500">
                      當天沒有可預約時段，請選擇其他日期。
                    </p>
                  )}
                </Card>
                <Card>
                  <Step n="03" title="留下聯絡資訊" />
                  <div className="mt-6 space-y-5">
                    <label>
                      姓名
                      <Input
                        name="name"
                        required
                        maxLength={80}
                        autoComplete="name"
                        placeholder="如何稱呼你"
                      />
                    </label>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <label>
                        Email
                        <Input
                          name="email"
                          required
                          type="email"
                          autoComplete="email"
                          maxLength={254}
                        />
                      </label>
                      <label>
                        聯絡電話
                        <Input
                          name="phone"
                          required
                          type="tel"
                          autoComplete="tel"
                          pattern="[+0-9 ()-]{7,25}"
                          placeholder="0912 345 678"
                        />
                      </label>
                    </div>
                    <p className="text-xs leading-6 text-slate-400">
                      以上資料僅供店家處理本次預約與聯絡使用。
                    </p>
                  </div>
                </Card>
              </div>
              <Card className="lg:sticky lg:top-6">
                <h2 className="text-lg font-bold">你的預約</h2>
                <div className="my-6 space-y-5 border-y border-slate-100 py-6 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">服務項目</p>
                    <p className="mt-2 font-semibold">{service?.name}</p>
                    <p className="mt-2 flex items-center gap-2 text-slate-500">
                      <Clock size={14} />
                      {service?.durationMinutes} 分鐘
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">服務人員</p>
                    <p className="mt-2">
                      {tenant.staff.find((s) => s.id === staffId)?.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">預約時間</p>
                    <p className="mt-2">
                      {date}{" "}
                      {startAt
                        ? DateTime.fromISO(startAt)
                            .setZone(tenant.timezone)
                            .toFormat("HH:mm")
                        : "尚未選擇時段"}
                    </p>
                  </div>
                </div>
                <div className="mb-6 flex justify-between">
                  <span className="text-sm text-slate-500">服務費用</span>
                  <span className="text-xl font-bold">
                    NT$ {service?.price.toLocaleString()}
                  </span>
                </div>
                {error && (
                  <div role="alert" className="mb-4 text-sm text-red-700">
                    {error}
                    <button
                      type="button"
                      onClick={() => {
                        resetSlots();
                        setRetry((v) => v + 1);
                      }}
                      className="mt-2 block underline"
                    >
                      重新查詢時段
                    </button>
                  </div>
                )}
                <Button
                  className="w-full"
                  disabled={busy || loading || !startAt}
                >
                  {busy ? "確認中…" : "確認預約"}
                  <ArrowRight size={15} />
                </Button>
                <p className="mt-4 text-center text-xs text-slate-400">
                  無須付款即可預約，到店依店家規定結帳。
                </p>
              </Card>
            </fieldset>
          </form>
        )}
        <footer className="mt-12 text-center text-xs text-slate-400">
          Powered by BookFlow · 好的服務，從從容預約開始。
        </footer>
      </div>
    </main>
  );
}
function Step({ n, title }: { n: string; title: string }) {
  return (
    <h2 className="flex items-center gap-3 font-bold">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-xs text-teal-700">
        {n}
      </span>
      {title}
    </h2>
  );
}
