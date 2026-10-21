"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  Scissors,
  Users,
  CalendarClock,
  Settings,
  ArrowUpRight,
  Plus,
  LogOut,
  Check,
  Store,
} from "lucide-react";
import { SchedulingPanel, type ScheduleStaff } from "./schedule-editor";
import { DateTime } from "luxon";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
type Service = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  active: boolean;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};
type Staff = { id: string; name: string; active: boolean };
type Hour = { weekday: number; openMinute: number; closeMinute: number };
type Data = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    minNoticeMinutes: number;
    maxAdvanceDays: number;
    slotIntervalMinutes: number;
  };
  role: string;
  services: Service[];
  staff: (Staff & ScheduleStaff)[];
  hours: Hour[];
  bookings: {
    id: string;
    startAt: string;
    endAt: string;
    serviceName: string;
    price: number;
    status: string;
    customer: { name: string; email: string; phone: string };
    staff: { name: string };
  }[];
};
type Membership = { id: string; name: string; role: string };
const tabs = [
  { id: "overview", label: "總覽", icon: LayoutDashboard },
  { id: "bookings", label: "預約列表", icon: CalendarClock },
  { id: "services", label: "服務項目", icon: Scissors },
  { id: "staff", label: "服務人員", icon: Users },
  { id: "schedule", label: "員工排班", icon: CalendarClock },
  { id: "hours", label: "營業時間", icon: Settings },
];
const money = (v: number) =>
  new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(v);
export function Dashboard({
  userName,
  memberships: initial,
}: {
  userName: string;
  memberships: Membership[];
}) {
  const router = useRouter();
  const [memberships, setMemberships] = useState(initial);
  const [tenantId, setTenantId] = useState(initial[0]?.id ?? "");
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(!!initial.length);
  const [creating, setCreating] = useState(!initial.length);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const refresh = useCallback(async () => {
    if (!tenantId) return;
    try {
      setData(await api<Data>("/api/tenants/" + tenantId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);
  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    api<Data>("/api/tenants/" + tenantId)
      .then((d) => {
        if (active) setData(d);
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
  }, [tenantId]);
  async function mutate(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(path, method, body);
      await refresh();
      setSuccess("已儲存變更");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const tenant = await api<Data["tenant"]>(
        "/api/tenants",
        "POST",
        Object.fromEntries(f),
      );
      setMemberships([
        ...memberships,
        { id: tenant.id, name: tenant.name, role: "OWNER" },
      ]);
      setTenantId(tenant.id);
      setCreating(false);
      setTab("overview");
      setSuccess("店家建立成功，接著新增服務與人員。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveService(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await mutate(
      "/api/tenants/" + tenantId + "/services",
      {
        ...(editingService ? { id: editingService.id } : {}),
        name: f.get("name"),
        price: Number(f.get("price")),
        durationMinutes: Number(f.get("durationMinutes")),
        bufferBeforeMinutes: Number(f.get("bufferBeforeMinutes")),
        bufferAfterMinutes: Number(f.get("bufferAfterMinutes")),
        active: f.get("active") === "on",
      },
      editingService ? "PATCH" : "POST",
    );
    if (ok) {
      form.reset();
      setEditingService(null);
    }
  }
  async function saveStaff(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await mutate(
      "/api/tenants/" + tenantId + "/staff",
      {
        ...(editingStaff ? { id: editingStaff.id } : {}),
        name: f.get("name"),
        active: f.get("active") === "on",
      },
      editingStaff ? "PATCH" : "POST",
    );
    if (ok) {
      form.reset();
      setEditingStaff(null);
    }
  }
  const canManage = data?.role !== "STAFF";
  const title = tabs.find((t) => t.id === tab)?.label;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="flex flex-col bg-[#102d35] text-white lg:fixed lg:inset-y-0 lg:w-[248px]">
        <Link
          href="/"
          className="flex items-center gap-3 px-7 py-7 text-2xl font-bold"
        >
          <CalendarDays className="text-teal-300" />
          BookFlow
          <span className="text-[10px] font-normal text-teal-300">
            WORKSPACE
          </span>
        </Link>
        <div className="px-5">
          <label className="text-xs text-teal-100/60" htmlFor="tenant-switch">
            目前店家
          </label>
          <select
            id="tenant-switch"
            disabled={busy || loading}
            value={tenantId}
            onChange={(e) => {
              setLoading(true);
              setData(null);
              setError("");
              setTenantId(e.target.value);
              setCreating(false);
              setEditingService(null);
              setEditingStaff(null);
            }}
            className="mt-2 border-teal-800 bg-[#1b3e46] text-white"
          >
            {memberships.length ? (
              memberships.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))
            ) : (
              <option value="">尚未建立店家</option>
            )}
          </select>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto p-4 lg:mt-5 lg:flex-col"
          aria-label="管理導覽"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setCreating(false);
                setSuccess("");
                setError("");
              }}
              className={
                "flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-left text-sm " +
                (tab === t.id && !creating
                  ? "bg-teal-700 text-white"
                  : "text-teal-100/70 hover:bg-white/5")
              }
            >
              <t.icon size={18} />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto hidden p-5 lg:block">
          <div className="rounded-xl border border-teal-800 bg-white/5 p-4">
            <p className="text-sm font-semibold">讓每一天，更有餘裕。</p>
            <p className="mt-2 text-xs leading-5 text-teal-100/60">
              設定服務與人員後，即可分享你的專屬預約頁面。
            </p>
          </div>
        </div>
      </aside>
      <div className="min-w-0 lg:col-start-2">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-5 lg:px-10">
          <span className="text-sm text-slate-500">
            工作空間 <span className="mx-2 text-slate-300">/</span>
            <span className="font-medium text-slate-700">
              {creating ? "建立店家" : title}
            </span>
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm">{userName}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await authClient.signOut();
                router.push("/login");
                router.refresh();
              }}
            >
              <LogOut size={15} />
              登出
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-5 lg:p-10">
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
              <button className="ml-4 underline" onClick={() => void refresh()}>
                重新載入
              </button>
            </div>
          )}
          {success && (
            <div
              role="status"
              className="mb-5 flex items-center gap-2 rounded-lg bg-teal-50 p-4 text-sm text-teal-800"
            >
              <Check size={16} />
              {success}
            </div>
          )}
          {creating ? (
            <div className="mx-auto max-w-xl">
              <p className="text-xs font-semibold tracking-widest text-teal-700">
                GET STARTED
              </p>
              <h1 className="mt-3 text-3xl font-bold">建立你的店家</h1>
              <p className="mt-3 text-slate-500">
                只需要幾個基本設定，就能開始接受預約。
              </p>
              <Card className="mt-8">
                <form onSubmit={create} className="space-y-5">
                  <label>
                    店家名稱
                    <Input
                      name="name"
                      required
                      minLength={2}
                      maxLength={80}
                      placeholder="例如：沐光工作室"
                    />
                  </label>
                  <label>
                    專屬網址 Slug
                    <Input
                      name="slug"
                      required
                      minLength={3}
                      maxLength={50}
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      placeholder="例如：morning-studio"
                    />
                    <span className="mt-2 block text-xs font-normal text-slate-400">
                      公開網址：/b/你的-slug；只接受英文小寫、數字與連字號。
                    </span>
                  </label>
                  <label>
                    店家時區
                    <select name="timezone" defaultValue="Asia/Taipei">
                      {[
                        "Asia/Taipei",
                        "Asia/Tokyo",
                        "Asia/Hong_Kong",
                        "Asia/Singapore",
                        "America/New_York",
                        "Europe/London",
                        "UTC",
                      ].map((z) => (
                        <option key={z}>{z}</option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs leading-6 text-slate-500">
                    預設週一至週五
                    09:00–18:00，可於「營業時間」調整。價格幣別為新臺幣。
                  </p>
                  <Button disabled={busy}>
                    <Store size={16} />
                    {busy ? "建立中…" : "建立店家"}
                  </Button>
                  {memberships.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setCreating(false)}
                    >
                      返回
                    </Button>
                  )}
                </form>
              </Card>
            </div>
          ) : (
            <>
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-widest text-teal-700">
                    YOUR BUSINESS, IN FLOW
                  </p>
                  <h1 className="mt-3 text-3xl font-bold">
                    {tab === "overview" ? "掌握店家的每一天" : title}
                  </h1>
                  <p className="mt-2 text-sm text-slate-500">
                    {data?.tenant.name ?? "選擇或建立一間店家"}
                    {data && " · " + data.tenant.timezone}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCreating(true)}>
                    <Plus size={16} />
                    新增店家
                  </Button>
                  {data && (
                    <Button asChild>
                      <Link href={"/b/" + data.tenant.slug} target="_blank">
                        公開預約頁 <ArrowUpRight size={16} />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
              {loading ? (
                <Card>
                  <p role="status" className="animate-pulse text-slate-500">
                    正在載入店家資料…
                  </p>
                </Card>
              ) : (
                data && (
                  <>
                    {tab === "overview" && (
                      <>
                        <div className="grid gap-4 sm:grid-cols-3">
                          {[
                            {
                              label: "有效預約",
                              value: data.bookings.filter(
                                (b) => b.status === "CONFIRMED",
                              ).length,
                              icon: CalendarClock,
                            },
                            {
                              label: "上架服務",
                              value: data.services.filter((s) => s.active)
                                .length,
                              icon: Scissors,
                            },
                            {
                              label: "服務人員",
                              value: data.staff.filter((s) => s.active).length,
                              icon: Users,
                            },
                          ].map((x) => (
                            <Card key={x.label}>
                              <div className="flex justify-between text-sm text-slate-500">
                                {x.label}
                                <x.icon size={18} className="text-teal-600" />
                              </div>
                              <p className="mt-5 text-4xl font-semibold">
                                {x.value}
                                <span className="ml-2 text-xs font-normal text-slate-400">
                                  最近資料
                                </span>
                              </p>
                            </Card>
                          ))}
                        </div>
                        <Card className="mt-6 flex flex-wrap items-center justify-between gap-5 border-teal-200 bg-teal-50/50">
                          <div>
                            <h2 className="font-semibold">
                              你的專屬預約入口，已經準備好了
                            </h2>
                            <p className="mt-2 text-sm text-slate-500">
                              新增服務和人員，分享 /b/{data.tenant.slug}{" "}
                              給顧客。
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => setTab("services")}
                          >
                            管理服務 <ArrowUpRight size={15} />
                          </Button>
                        </Card>
                      </>
                    )}
                    {(tab === "overview" || tab === "bookings") && (
                      <Card className="mt-6 overflow-hidden">
                        <div className="mb-6 flex items-center justify-between">
                          <h2 className="text-lg font-bold">預約紀錄</h2>
                          <span className="text-xs text-slate-400">
                            最近 200 筆 · 店家當地時間
                          </span>
                        </div>
                        {!data.bookings.length ? (
                          <Empty
                            text="尚無預約"
                            detail="顧客完成公開預約後，資料就會顯示在這裡。"
                          />
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[680px] text-left text-sm">
                              <thead className="border-b text-xs text-slate-400">
                                <tr>
                                  {[
                                    "時間",
                                    "顧客",
                                    "服務 / 人員",
                                    "金額",
                                    "狀態",
                                  ].map((t) => (
                                    <th key={t} className="pb-4 font-medium">
                                      {t}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {data.bookings.map((b) => (
                                  <tr
                                    key={b.id}
                                    className="border-b border-slate-100 last:border-0"
                                  >
                                    <td className="py-5">
                                      <p className="font-semibold">
                                        {DateTime.fromISO(b.startAt)
                                          .setZone(data.tenant.timezone)
                                          .toFormat("MM/dd HH:mm")}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-400">
                                        {DateTime.fromISO(b.startAt)
                                          .setZone(data.tenant.timezone)
                                          .toFormat("yyyy")}
                                      </p>
                                    </td>
                                    <td>
                                      {b.customer.name}
                                      <p className="mt-1 text-xs text-slate-400">
                                        {b.customer.phone}
                                      </p>
                                    </td>
                                    <td>
                                      {b.serviceName}
                                      <p className="mt-1 text-xs text-slate-400">
                                        {b.staff.name}
                                      </p>
                                    </td>
                                    <td>{money(b.price)}</td>
                                    <td>
                                      <span className="rounded-full bg-teal-50 px-3 py-1 text-xs text-teal-700">
                                        {b.status === "CONFIRMED"
                                          ? "已確認"
                                          : "已取消"}
                                      </span>
                                      {canManage &&
                                        b.status === "CONFIRMED" && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={busy}
                                            onClick={() =>
                                              void mutate(
                                                `/api/tenants/${tenantId}/cancel`,
                                                { id: b.id },
                                              )
                                            }
                                          >
                                            取消預約
                                          </Button>
                                        )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </Card>
                    )}
                    {tab === "schedule" && (
                      <SchedulingPanel
                        key={tenantId}
                        staff={data.staff}
                        services={data.services}
                        tenant={data.tenant}
                        disabled={busy || !canManage}
                        save={mutate}
                      />
                    )}
                    {tab === "services" && (
                      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
                        <div className="space-y-4">
                          {!data.services.length && (
                            <Card>
                              <Empty
                                text="建立第一項服務"
                                detail="設定名稱、價格與分鐘數，讓顧客知道你提供什麼。"
                              />
                            </Card>
                          )}
                          {data.services.map((s) => (
                            <Card
                              key={s.id}
                              className="flex flex-wrap items-center justify-between gap-4"
                            >
                              <div className="flex gap-4">
                                <div className="rounded-lg bg-teal-50 p-3 text-teal-700">
                                  <Scissors size={22} />
                                </div>
                                <div>
                                  <h2 className="font-bold">
                                    {s.name}
                                    <span
                                      className={
                                        "ml-3 text-xs font-normal " +
                                        (s.active
                                          ? "text-teal-700"
                                          : "text-slate-400")
                                      }
                                    >
                                      {s.active ? "上架中" : "已停用"}
                                    </span>
                                  </h2>
                                  <p className="mt-2 text-sm text-slate-500">
                                    {s.durationMinutes} 分鐘{" "}
                                    <span className="mx-2">·</span>{" "}
                                    {money(s.price)}
                                  </p>
                                </div>
                              </div>
                              {canManage && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingService(s)}
                                >
                                  編輯
                                </Button>
                              )}
                            </Card>
                          ))}
                        </div>
                        {canManage && (
                          <Card className="h-fit">
                            <h2 className="mb-5 font-bold">
                              {editingService ? "編輯服務" : "新增服務"}
                            </h2>
                            <form
                              key={editingService?.id ?? "new-service"}
                              onSubmit={saveService}
                              className="space-y-4"
                            >
                              <label>
                                服務名稱
                                <Input
                                  name="name"
                                  defaultValue={editingService?.name}
                                  required
                                  maxLength={80}
                                />
                              </label>
                              <label>
                                價格（NT$）
                                <Input
                                  name="price"
                                  type="number"
                                  min={0}
                                  max={10000000}
                                  defaultValue={editingService?.price ?? 0}
                                  required
                                />
                              </label>
                              <label>
                                服務分鐘數
                                <Input
                                  name="durationMinutes"
                                  type="number"
                                  min={15}
                                  max={480}
                                  step={15}
                                  defaultValue={
                                    editingService?.durationMinutes ?? 60
                                  }
                                  required
                                />
                              </label>
                              {[
                                "bufferBeforeMinutes",
                                "bufferAfterMinutes",
                              ].map((key, i) => (
                                <label key={key}>
                                  {i === 0
                                    ? "服務前緩衝分鐘"
                                    : "服務後緩衝分鐘"}
                                  <Input
                                    name={key}
                                    type="number"
                                    min={0}
                                    max={240}
                                    required
                                    defaultValue={
                                      editingService?.[
                                        key as
                                          | "bufferBeforeMinutes"
                                          | "bufferAfterMinutes"
                                      ] ?? 0
                                    }
                                  />
                                </label>
                              ))}
                              <label className="flex items-center gap-2">
                                <input
                                  name="active"
                                  type="checkbox"
                                  defaultChecked={
                                    editingService?.active ?? true
                                  }
                                />
                                上架此服務
                              </label>
                              <Button disabled={busy}>
                                {busy ? "儲存中…" : "儲存服務"}
                              </Button>
                              {editingService && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => setEditingService(null)}
                                >
                                  取消
                                </Button>
                              )}
                            </form>
                          </Card>
                        )}
                      </div>
                    )}
                    {tab === "staff" && (
                      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
                        <div className="space-y-4">
                          {!data.staff.length && (
                            <Card>
                              <Empty
                                text="團隊就從這裡開始"
                                detail="新增提供服務的人員，讓顧客選擇預約對象。"
                              />
                            </Card>
                          )}
                          {data.staff.map((s) => (
                            <Card
                              key={s.id}
                              className="flex items-center justify-between"
                            >
                              <div className="flex items-center gap-4">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 font-bold text-orange-700">
                                  {s.name.slice(0, 1)}
                                </span>
                                <div>
                                  <h2 className="font-semibold">{s.name}</h2>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {s.active ? "可接受預約" : "已停用"}
                                  </p>
                                </div>
                              </div>
                              {canManage && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingStaff(s)}
                                >
                                  編輯
                                </Button>
                              )}
                            </Card>
                          ))}
                        </div>
                        {canManage && (
                          <Card className="h-fit">
                            <h2 className="mb-5 font-bold">
                              {editingStaff ? "編輯人員" : "新增人員"}
                            </h2>
                            <form
                              key={editingStaff?.id ?? "new-staff"}
                              onSubmit={saveStaff}
                              className="space-y-4"
                            >
                              <label>
                                人員姓名
                                <Input
                                  name="name"
                                  defaultValue={editingStaff?.name}
                                  required
                                  maxLength={80}
                                />
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  name="active"
                                  defaultChecked={editingStaff?.active ?? true}
                                />
                                可接受預約
                              </label>
                              <p className="text-xs leading-6 text-slate-400">
                                第一階段所有人員共用店家營業時間，並可提供所有上架服務。人員資料與登入帳號分開管理。
                              </p>
                              <Button disabled={busy}>
                                {busy ? "儲存中…" : "儲存人員"}
                              </Button>
                              {editingStaff && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => setEditingStaff(null)}
                                >
                                  取消
                                </Button>
                              )}
                            </form>
                          </Card>
                        )}
                      </div>
                    )}
                    {tab === "hours" && (
                      <Card>
                        <h2 className="text-lg font-bold">每週營業時間</h2>
                        <p className="mt-2 text-sm text-slate-500">
                          以 {data.tenant.timezone} 當地時間為準，每 30
                          分鐘開放一個起始時段。
                        </p>
                        <form
                          key={JSON.stringify(data.hours)}
                          className="mt-7 space-y-4"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            const hours = Array.from(
                              { length: 7 },
                              (_, weekday) => ({
                                weekday,
                                openMinute: Number(f.get("open" + weekday)),
                                closeMinute: Number(f.get("close" + weekday)),
                              }),
                            ).filter((h) => f.get("day" + h.weekday) === "on");
                            await mutate(
                              "/api/tenants/" + tenantId + "/hours",
                              hours,
                            );
                          }}
                        >
                          {["日", "一", "二", "三", "四", "五", "六"].map(
                            (d, i) => {
                              const h = data.hours.find((h) => h.weekday === i);
                              return (
                                <div
                                  key={i}
                                  className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-4"
                                >
                                  <label className="flex w-24 items-center gap-2">
                                    <input
                                      type="checkbox"
                                      name={"day" + i}
                                      defaultChecked={!!h}
                                      disabled={!canManage}
                                    />
                                    星期{d}
                                  </label>
                                  <label
                                    className="sr-only"
                                    htmlFor={"open" + i}
                                  >
                                    星期{d}開始
                                  </label>
                                  <select
                                    id={"open" + i}
                                    name={"open" + i}
                                    defaultValue={h?.openMinute ?? 540}
                                    disabled={!canManage}
                                    className="!w-28"
                                  >
                                    {Array.from({ length: 48 }, (_, n) => (
                                      <option key={n} value={n * 30}>
                                        {String(Math.floor(n / 2)).padStart(
                                          2,
                                          "0",
                                        )}
                                        :{n % 2 ? "30" : "00"}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="text-slate-400">至</span>
                                  <label
                                    className="sr-only"
                                    htmlFor={"close" + i}
                                  >
                                    星期{d}結束
                                  </label>
                                  <select
                                    id={"close" + i}
                                    name={"close" + i}
                                    defaultValue={h?.closeMinute ?? 1080}
                                    disabled={!canManage}
                                    className="!w-28"
                                  >
                                    {Array.from({ length: 48 }, (_, n) => (
                                      <option key={n} value={(n + 1) * 30}>
                                        {String(
                                          Math.floor((n + 1) / 2),
                                        ).padStart(2, "0")}
                                        :{(n + 1) % 2 ? "30" : "00"}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            },
                          )}
                          {canManage && (
                            <Button disabled={busy}>
                              {busy ? "儲存中…" : "儲存營業時間"}
                            </Button>
                          )}
                        </form>
                      </Card>
                    )}
                  </>
                )
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function Empty({ text, detail }: { text: string; detail: string }) {
  return (
    <div className="py-14 text-center">
      <CalendarDays className="mx-auto mb-4 text-slate-300" size={36} />
      <h3 className="font-semibold">{text}</h3>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
    </div>
  );
}
