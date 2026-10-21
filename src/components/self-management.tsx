"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { BookingEditor, type Booking } from "./operations-panel";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
type Detail = Booking & {
  tenant: {
    name: string;
    slug: string;
    timezone: string;
    cancelCutoffMinutes: number;
    rescheduleCutoffMinutes: number;
  };
};
export function SelfManagement() {
  const [token, setToken] = useState("");
  const [booking, setBooking] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const value = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    if (value) {
      sessionStorage.setItem("bookflow-management", value);
    }
    const saved = value || sessionStorage.getItem("bookflow-management") || "";
    api<Detail>("/api/manage", "POST", { token: saved, mode: "detail" })
      .then((data) => {
        setToken(saved);
        setBooking(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function refresh() {
    setError("");
    setLoading(true);
    try {
      setBooking(
        await api<Detail>("/api/manage", "POST", { token, mode: "detail" }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl p-5 sm:py-12">
      <h1 className="mb-6 text-3xl font-bold">管理我的預約</h1>
      <p className="mb-5 text-sm text-slate-500">
        此連結具有預約操作權限，請妥善保管。
      </p>
      {loading && <p role="status">正在載入預約…</p>}
      {error && (
        <p role="alert" className="my-4 text-red-700">
          {error}
        </p>
      )}
      {booking && (
        <Card>
          <p className="mb-4 font-semibold">{booking.tenant.name}</p>
          <p className="mb-5 text-sm">
            取消須於開始前 {booking.tenant.cancelCutoffMinutes}{" "}
            分鐘；改期須於開始前 {booking.tenant.rescheduleCutoffMinutes}{" "}
            分鐘。超過截止時間請聯絡店家。
          </p>
          <BookingEditor
            key={booking.revision}
            booking={booking}
            token={token}
            timezone={booking.tenant.timezone}
            services={[{ id: booking.serviceId, name: booking.serviceName }]}
            staff={[{ id: booking.staffId, name: booking.staff.name }]}
            onSaved={() => void refresh()}
          />
          <Button
            className="mt-4"
            variant="ghost"
            onClick={() => void refresh()}
          >
            重新載入預約
          </Button>
        </Card>
      )}
    </main>
  );
}
