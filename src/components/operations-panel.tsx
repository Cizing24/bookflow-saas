"use client";
import { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { calendarLayout } from "@/lib/calendar-layout";
import { api } from "@/lib/client-api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
export const statusLabels: Record<string, string> = {
  CONFIRMED: "已確認",
  CANCELLED: "已取消",
  COMPLETED: "已完成",
  NO_SHOW: "未到場",
};
const colors: Record<string, string> = {
  CONFIRMED: "border-teal-500 bg-teal-50 text-teal-900",
  CANCELLED: "border-red-400 bg-red-50 text-red-900",
  COMPLETED: "border-blue-500 bg-blue-50 text-blue-900",
  NO_SHOW: "border-amber-500 bg-amber-50 text-amber-900",
};
type Resource = { id: string; name: string };
export type Booking = {
  id: string;
  startAt: string;
  endAt: string;
  serviceName: string;
  serviceId: string;
  staffId: string;
  price: number;
  status: string;
  revision: number;
  customer?: { name: string; email: string; phone: string };
  staff: { name: string };
  events?: {
    id: string;
    action: string;
    actor: string;
    createdAt: string;
    before: unknown;
    after: unknown;
  }[];
};
type Tenant = {
  id: string;
  timezone: string;
  cancelCutoffMinutes: number;
  rescheduleCutoffMinutes: number;
};
function useData<T>(url: string, version = 0) {
  const [state, setState] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
    url?: string;
    version?: number;
  }>({ loading: true });
  useEffect(() => {
    let active = true;
    api<T>(url)
      .then((data) => {
        if (active) setState({ data, loading: false, url, version });
      })
      .catch((e) => {
        if (active)
          setState({ error: e.message, loading: false, url, version });
      });
    return () => {
      active = false;
    };
  }, [url, version]);
  return state.url === url && state.version === version
    ? state
    : { loading: true };
}
function Feedback({ error, loading }: { error?: string; loading?: boolean }) {
  return (
    <>
      {error && (
        <p role="alert" className="my-3 rounded bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="p-3">
          正在載入…
        </p>
      )}
    </>
  );
}
export function BookingEditor({
  booking,
  timezone,
  services,
  staff,
  tenantId,
  token,
  onSaved,
}: {
  booking: Booking;
  timezone: string;
  services: Resource[];
  staff: Resource[];
  tenantId?: string;
  token?: string;
  onSaved: () => void;
}) {
  const [serviceId, setServiceId] = useState(booking.serviceId);
  const [staffId, setStaffId] = useState(booking.staffId);
  const [date, setDate] = useState(
    DateTime.fromISO(booking.startAt).setZone(timezone).toISODate()!,
  );
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loaded, setLoaded] = useState(false);
  async function loadSlots() {
    setBusy(true);
    setError("");
    setSlot("");
    setSuccess("");
    try {
      const q = { id: booking.id, date, serviceId, staffId };
      const result = token
        ? await api<string[]>("/api/manage", "POST", {
            token,
            mode: "slots",
            ...q,
          })
        : await api<string[]>(
            `/api/tenants/${tenantId}/booking-slots?${new URLSearchParams(q)}`,
          );
      setSlots(result);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function change(action: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const data = {
        id: booking.id,
        action,
        revision: booking.revision,
        ...(action === "RESCHEDULE"
          ? { serviceId, staffId, startAt: slot }
          : {}),
      };
      await api(
        token ? "/api/manage" : `/api/tenants/${tenantId}/booking`,
        "POST",
        { ...data, ...(token ? { token } : {}) },
      );
      setSuccess("預約已更新");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fmt = (v: string) =>
    DateTime.fromISO(v).setZone(timezone).toFormat("yyyy-MM-dd HH:mm ZZ");
  const changed = () => {
    setSlots([]);
    setSlot("");
    setLoaded(false);
  };
  return (
    <section aria-label="預約詳情" className="space-y-4">
      <h2 className="text-xl font-bold">預約詳情</h2>
      <p>
        {booking.serviceName} · {booking.staff.name} · NT$ {booking.price}
      </p>
      <p>
        {fmt(booking.startAt)} – {fmt(booking.endAt)} · {timezone}
      </p>
      <p>狀態：{statusLabels[booking.status]}</p>
      {booking.customer && (
        <p>
          {booking.customer.name} · {booking.customer.email} ·{" "}
          {booking.customer.phone}
        </p>
      )}
      <p className="break-all text-xs text-slate-500">編號：{booking.id}</p>
      <Feedback error={error} />
      {success && <p role="status">{success}</p>}
      {booking.status === "CONFIRMED" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              改期服務
              <select
                aria-label="改期服務"
                value={serviceId}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  changed();
                }}
                disabled={busy}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              改期員工
              <select
                aria-label="改期員工"
                value={staffId}
                onChange={(e) => {
                  setStaffId(e.target.value);
                  changed();
                }}
                disabled={busy}
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              改期日期
              <Input
                type="date"
                value={date}
                required
                onChange={(e) => {
                  setDate(e.target.value);
                  changed();
                }}
                disabled={busy}
              />
            </label>
          </div>
          <Button
            variant="outline"
            disabled={busy || !date}
            onClick={() => void loadSlots()}
          >
            查詢改期時段
          </Button>
          {loaded && !slots.length && <p>此日期沒有可用時段。</p>}
          {!!slots.length && (
            <label>
              改期時段
              <select
                aria-label="改期時段"
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                disabled={busy}
              >
                <option value="">請選擇</option>
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {fmt(s)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !slot}
              onClick={() => void change("RESCHEDULE")}
            >
              確認改期
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void change("CANCELLED")}
            >
              取消此預約
            </Button>
            {!token && (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void change("COMPLETED")}
                >
                  完成服務
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void change("NO_SHOW")}
                >
                  標記未到場
                </Button>
              </>
            )}
          </div>
        </>
      )}
      {booking.events && (
        <details>
          <summary className="cursor-pointer">異動紀錄（最近 100 筆）</summary>
          {booking.events.map((e) => (
            <div key={e.id} className="my-2 rounded bg-slate-50 p-3 text-xs">
              <p>
                {fmt(e.createdAt)} · {e.actor} · {e.action}
              </p>
              <pre className="mt-2 overflow-x-auto">
                {JSON.stringify({ before: e.before, after: e.after }, null, 2)}
              </pre>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
export function CalendarPanel({ tenant }: { tenant: Tenant }) {
  const [date, setDate] = useState(
    DateTime.now().setZone(tenant.timezone).toISODate()!,
  );
  const [view, setView] = useState("day");
  const [staffId, setStaffId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [selected, setSelected] = useState("");
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const detailPanel = useRef<HTMLDivElement>(null);
  const selectedTrigger = useRef<HTMLButtonElement | null>(null);
  function closeDetail() {
    setSelected("");
    selectedTrigger.current?.focus();
  }
  useEffect(() => {
    if (selected) detailPanel.current?.focus();
  }, [selected]);
  const days = view === "week" ? 7 : 1;
  const q = new URLSearchParams({
    from: date,
    days: String(days),
    ...(staffId ? { staffId } : {}),
    ...(serviceId ? { serviceId } : {}),
  });
  const { data, loading, error } = useData<{
    bookings: Booking[];
    staff: Resource[];
    services: Resource[];
  }>(`/api/tenants/${tenant.id}/calendar?${q}`, version);
  const detail = useData<Booking>(
    `/api/tenants/${tenant.id}/booking?id=${encodeURIComponent(selected || "__none__")}`,
    version,
  );
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 420;
  }, [date, view, loading]);
  const positions = calendarLayout(data?.bookings ?? [], tenant.timezone);
  const columns = (data?.staff ?? []).filter(
    (s) => !staffId || s.id === staffId,
  );
  return (
    <div className="space-y-5">
      {saved && (
        <p role="status" className="rounded bg-teal-50 p-3 text-teal-800">
          預約已更新
        </p>
      )}
      <Card>
        <div className="grid gap-3 sm:grid-cols-4">
          <label>
            行事曆日期
            <Input
              type="date"
              required
              value={date}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
            />
          </label>
          <label>
            檢視
            <select
              aria-label="檢視"
              value={view}
              onChange={(e) => setView(e.target.value)}
            >
              <option value="day">日檢視</option>
              <option value="week">週檢視</option>
            </select>
          </label>
          <label>
            篩選員工
            <select
              aria-label="篩選員工"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              <option value="">全部員工</option>
              {data?.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            篩選服務
            <select
              aria-label="篩選服務"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              <option value="">全部服務</option>
              {data?.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="my-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setDate(DateTime.fromISO(date).minus({ days }).toISODate()!)
            }
          >
            上一{days === 7 ? "週" : "日"}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setDate(DateTime.now().setZone(tenant.timezone).toISODate()!)
            }
          >
            今天
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setDate(DateTime.fromISO(date).plus({ days }).toISODate()!)
            }
          >
            下一{days === 7 ? "週" : "日"}
          </Button>
          <Button variant="ghost" onClick={() => setVersion((v) => v + 1)}>
            重新整理
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          {tenant.timezone} ·
          手機可左右捲動查看員工與日期；點選預約開啟操作面板。
        </p>
        <div className="my-3 flex flex-wrap gap-3 text-xs">
          {Object.entries(statusLabels).map(([key, label]) => (
            <span
              key={key}
              className={`rounded border-l-4 px-2 py-1 ${colors[key]}`}
            >
              {label}
            </span>
          ))}
        </div>
        <Feedback loading={loading} error={error} />
        {data && !data.bookings.length && (
          <p className="py-3">此範圍沒有預約。</p>
        )}
        {data && !!columns.length && (
          <div
            ref={scroll}
            className="max-h-[65vh] overflow-auto rounded border"
            aria-label="預約行事曆"
          >
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${days}, minmax(${Math.max(260, columns.length * 180)}px, 1fr))`,
              }}
            >
              {Array.from({ length: days }, (_, i) => {
                const day = DateTime.fromISO(date)
                  .plus({ days: i })
                  .toISODate()!;
                return (
                  <div key={day} className="border-r">
                    <h3 className="sticky top-0 z-20 bg-slate-100 p-2 text-center font-bold">
                      {day}
                    </h3>
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: `repeat(${columns.length}, minmax(180px, 1fr))`,
                      }}
                    >
                      {columns.map((s) => (
                        <div key={s.id} className="border-r">
                          <p className="sticky top-9 z-10 bg-white p-2 text-center font-semibold">
                            {s.name}
                          </p>
                          <div
                            className="relative h-[1440px]"
                            style={{
                              backgroundImage:
                                "repeating-linear-gradient(to bottom, transparent 0px, transparent 59px, #e2e8f0 59px, #e2e8f0 60px)",
                            }}
                          >
                            {Array.from({ length: 24 }, (_, h) => (
                              <span
                                key={h}
                                className="absolute text-[10px] text-slate-400"
                                style={{ top: h * 60 }}
                              >
                                {String(h).padStart(2, "0")}:00
                              </span>
                            ))}
                            {data.bookings
                              .filter(
                                (b) =>
                                  b.staffId === s.id &&
                                  DateTime.fromISO(b.startAt)
                                    .setZone(tenant.timezone)
                                    .toISODate() === day,
                              )
                              .map((b) => {
                                const start = DateTime.fromISO(
                                  b.startAt,
                                ).setZone(tenant.timezone);
                                const position = positions.get(b.id)!;
                                return (
                                  <button
                                    key={b.id}
                                    onClick={(e) => {
                                      selectedTrigger.current = e.currentTarget;
                                      setSelected(b.id);
                                    }}
                                    className={`absolute overflow-auto rounded border-l-4 p-1 text-left text-xs shadow-sm focus:outline-2 ${colors[b.status]}`}
                                    style={{
                                      top: position.top,
                                      left: `calc(${(100 * position.lane) / position.lanes}% + ${32 - (36 * position.lane) / position.lanes}px)`,
                                      width: `calc(${100 / position.lanes}% - ${36 / position.lanes}px)`,
                                      minHeight: position.height - 2,
                                      maxHeight: position.height - 2,
                                    }}
                                  >
                                    <strong>
                                      {start.toFormat("HH:mm ZZ")}{" "}
                                      {b.customer?.name}
                                    </strong>
                                    <span className="block">
                                      {b.serviceName} · {statusLabels[b.status]}
                                    </span>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
      {selected && (
        <Card
          ref={detailPanel}
          role="region"
          aria-label="預約操作面板"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeDetail();
          }}
        >
          <Button variant="ghost" onClick={closeDetail}>
            關閉詳情
          </Button>
          <Feedback error={detail.error} loading={detail.loading} />
          {detail.data && (
            <BookingEditor
              key={`${selected}-${detail.data.revision}`}
              booking={detail.data}
              timezone={tenant.timezone}
              tenantId={tenant.id}
              services={data?.services ?? []}
              staff={data?.staff ?? []}
              onSaved={() => {
                setSaved(true);
                setVersion((v) => v + 1);
              }}
            />
          )}
        </Card>
      )}
    </div>
  );
}
type Stats = {
  todayCount: number;
  total: number;
  completed: number;
  cancelled: number;
  services: { name: string; count: number }[];
  trend: { date: string; count: number }[];
  upcoming: Booking[];
};
export function StatisticsPanel({ tenant }: { tenant: Tenant }) {
  const [from, setFrom] = useState(
    DateTime.now().setZone(tenant.timezone).startOf("month").toISODate()!,
  );
  const [days, setDays] = useState(30);
  const { data, error, loading } = useData<Stats>(
    `/api/tenants/${tenant.id}/statistics?${new URLSearchParams({ from, days: String(days) })}`,
  );
  return (
    <Card className="mb-6">
      <h2 className="mb-4 text-xl font-bold">營運數據</h2>
      <div className="flex flex-wrap gap-4">
        <label>
          統計起日
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              if (e.target.value) setFrom(e.target.value);
            }}
          />
        </label>
        <label>
          統計天數
          <Input
            type="number"
            min={1}
            max={92}
            value={days}
            onChange={(e) =>
              setDays(Math.min(92, Math.max(1, Number(e.target.value))))
            }
          />
        </label>
      </div>
      <Feedback error={error} loading={loading} />
      {data && (
        <>
          <div className="my-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["今日預約", data.todayCount],
              ["期間預約", data.total],
              ["期間完成", data.completed],
              ["期間取消", data.cancelled],
            ].map(([label, count]) => (
              <div key={label} className="rounded bg-slate-50 p-4">
                <p>{label}</p>
                <strong className="text-2xl">{count}</strong>
              </div>
            ))}
          </div>
          <h3 className="font-bold">即將開始</h3>
          {!data.upcoming.length && <p>尚無即將開始的預約。</p>}
          {data.upcoming.map((b) => (
            <p key={b.id} className="my-2 text-sm">
              {DateTime.fromISO(b.startAt)
                .setZone(tenant.timezone)
                .toFormat("MM/dd HH:mm")}{" "}
              · {b.serviceName} · {b.staff.name} · {b.customer?.name}
            </p>
          ))}
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <section>
              <h3 className="font-bold">各服務預約量</h3>
              {data.services.map((s, i) => (
                <p key={i} className="mt-2">
                  {s.name}：{s.count}
                </p>
              ))}
            </section>
            <section>
              <h3 className="font-bold">每日預約趨勢</h3>
              <div className="mt-2 max-h-64 overflow-y-auto">
                {data.trend.map((t) => (
                  <div
                    key={t.date}
                    className="my-1 flex items-center gap-2 text-xs"
                  >
                    <span className="w-20 shrink-0">{t.date}</span>
                    <span
                      className="h-3 bg-teal-500"
                      style={{
                        width: `${(t.count / Math.max(1, ...data.trend.map((v) => v.count))) * 60}%`,
                      }}
                    />
                    <span>{t.count}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </Card>
  );
}
type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  count: number;
};
export function CustomersPanel({ tenant }: { tenant: Tenant }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [id, setId] = useState("");
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const list = useData<{ customers: Customer[] }>(
    `/api/tenants/${tenant.id}/customers?${new URLSearchParams({ search: query, page: String(page) })}`,
  );
  const detail = useData<{
    customer: Customer;
    count: number;
    history: Booking[];
  }>(
    `/api/tenants/${tenant.id}/customers?${new URLSearchParams(id ? { id, page: String(historyPage) } : { search: "" })}`,
  );
  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-xl font-bold">顧客管理</h2>
        <p className="mt-2 text-xs text-slate-500">
          依同店 Email 彙整歷史預約；相同 Email
          不代表已驗證身分。聯絡資料保留各次填寫快照。
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setPage(1);
          }}
          className="my-4 flex flex-wrap gap-2"
        >
          <label className="flex-1">
            搜尋顧客
            <Input
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="姓名、Email 或電話"
            />
          </label>
          <Button className="self-end">搜尋</Button>
        </form>
        <Feedback error={list.error} loading={list.loading} />
        {!list.data?.customers.length && <p>沒有符合的顧客。</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[550px] text-left text-sm">
            <thead>
              <tr>
                <th>姓名</th>
                <th>Email</th>
                <th>電話</th>
                <th>預約次數</th>
                <th>詳情</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.customers.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-3">{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.phone}</td>
                  <td>{c.count}</td>
                  <td>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setId(c.id);
                        setHistoryPage(1);
                      }}
                    >
                      查看顧客
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一頁
          </Button>
          <span>第 {page} 頁</span>
          <Button
            variant="outline"
            disabled={(list.data?.customers.length ?? 0) < 50}
            onClick={() => setPage((p) => p + 1)}
          >
            下一頁
          </Button>
        </div>
      </Card>
      {id && (
        <Card>
          <h2 className="text-xl font-bold">顧客詳情</h2>
          <Feedback error={detail.error} loading={detail.loading} />
          {detail.data?.customer && (
            <>
              <p className="my-3">
                {detail.data.customer.name} · {detail.data.customer.email} ·{" "}
                {detail.data.customer.phone}
              </p>
              <p>歷史預約：{detail.data.count} 次</p>
              {detail.data.history.map((b) => (
                <p key={b.id} className="mt-3 border-t pt-3 text-sm">
                  {DateTime.fromISO(b.startAt)
                    .setZone(tenant.timezone)
                    .toFormat("yyyy-MM-dd HH:mm")}{" "}
                  · {b.serviceName} · {b.staff.name} · {statusLabels[b.status]}
                </p>
              ))}
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage((p) => p - 1)}
                >
                  較新紀錄
                </Button>
                <Button
                  variant="outline"
                  disabled={historyPage * 50 >= detail.data.count}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  較舊紀錄
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
export function OwnerPanel({ tenant }: { tenant: Tenant }) {
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const memberData = useData<
    {
      id: string;
      role: string;
      staffId: string | null;
      user: { name: string; email: string };
    }[]
  >(`/api/tenants/${tenant.id}/members`, version);
  const notes = useData<
    {
      id: string;
      subject: string;
      body: string;
      status: string;
      attempts: number;
      lastError: string | null;
    }[]
  >(`/api/tenants/${tenant.id}/notifications`, version);
  const resources = useData<{ staff: Resource[] }>(`/api/tenants/${tenant.id}`);
  async function save(resource: string, data: unknown) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(`/api/tenants/${tenant.id}/${resource}`, "POST", data);
      setSuccess("設定已儲存");
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Feedback error={error || memberData.error || notes.error} />
      {success && <p role="status">{success}</p>}
      <Card>
        <h2 className="mb-4 text-xl font-bold">自助異動政策</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save("settings", {
              cancelCutoffMinutes: Number(f.get("cancel")),
              rescheduleCutoffMinutes: Number(f.get("reschedule")),
            });
          }}
        >
          <label>
            取消截止（開始前分鐘）
            <Input
              name="cancel"
              type="number"
              min={0}
              max={525600}
              defaultValue={tenant.cancelCutoffMinutes}
              required
            />
          </label>
          <label>
            改期截止（開始前分鐘）
            <Input
              name="reschedule"
              type="number"
              min={0}
              max={525600}
              defaultValue={tenant.rescheduleCutoffMinutes}
              required
            />
          </label>
          <Button disabled={busy}>儲存截止時間</Button>
        </form>
      </Card>
      <Card>
        <h2 className="mb-4 text-xl font-bold">成員權限</h2>
        <p className="text-sm">
          成員須先註冊；Staff
          必須綁定服務人員才可取得自身資料。此處不變更擁有者。
        </p>
        {memberData.data?.map((m) => (
          <p className="my-2 text-sm" key={m.id}>
            {m.user.name} · {m.user.email} · {m.role} · {m.staffId ?? "未綁定"}
          </p>
        ))}
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save("members", {
              email: f.get("email"),
              role: f.get("role"),
              staffId: f.get("staffId") || null,
              remove: f.get("remove") === "on",
            });
          }}
        >
          <label>
            成員 Email
            <Input name="email" type="email" required />
          </label>
          <label>
            成員角色
            <select name="role" aria-label="成員角色">
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <label>
            綁定服務人員
            <select name="staffId" aria-label="綁定服務人員">
              <option value="">不綁定</option>
              {resources.data?.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="self-center">
            <input name="remove" type="checkbox" /> 移除此成員
          </label>
          <Button disabled={busy}>儲存成員</Button>
        </form>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">通知與 Email 預覽</h2>
          <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
            重新整理通知
          </Button>
        </div>
        <p className="my-3 text-sm">
          PENDING 等待／重試；PREVIEWED 僅本地預覽；SENT 才代表 Provider
          已接受。預覽含私人管理連結，請勿分享。
        </p>
        {!notes.data?.length && <p>尚無通知。</p>}
        {notes.data?.map((n) => (
          <details key={n.id} className="my-2 rounded border p-3">
            <summary>
              {n.subject} · {n.status} · 嘗試 {n.attempts} 次
            </summary>
            <pre className="mt-3 whitespace-pre-wrap break-all text-xs">
              {n.body}
            </pre>
            {n.lastError && <p>{n.lastError}</p>}
          </details>
        ))}
      </Card>
    </div>
  );
}
