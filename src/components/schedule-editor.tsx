"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
export type ScheduleStaff = {
  id: string;
  name: string;
  customSchedule: boolean;
  services: { serviceId: string }[];
  schedule: {
    weekday: number;
    openMinute: number;
    closeMinute: number;
    kind: string;
  }[];
  absences: {
    date: string;
    openMinute: number;
    closeMinute: number;
    reason: string;
  }[];
};
type Policy = {
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  slotIntervalMinutes: number;
};
type Save = (path: string, body: unknown) => Promise<boolean>;
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const minute = (clock: string, end = false) => {
  const [h, m] = clock.split(":").map(Number);
  return end && h === 0 && m === 0 ? 1440 : h * 60 + m;
};
const weekdays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
export function SchedulingPanel({
  staff,
  services,
  tenant,
  disabled,
  save,
}: {
  staff: ScheduleStaff[];
  services: { id: string; name: string }[];
  tenant: Policy & { id: string; timezone: string };
  disabled: boolean;
  save: Save;
}) {
  const base = `/api/tenants/${tenant.id}/`;
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-bold">預約政策</h2>
        <p className="my-4 text-sm text-slate-500">
          全體員工使用店家時區 {tenant.timezone}
          。班表取與店家營業時間的交集；休息及請假會扣除可用時間。跨日班段請拆成兩天，結束
          00:00 代表當日 24:00。
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await save(
              base + "policy",
              Object.fromEntries(
                [
                  "minNoticeMinutes",
                  "maxAdvanceDays",
                  "slotIntervalMinutes",
                ].map((k) => [k, Number(f.get(k))]),
              ),
            );
          }}
        >
          <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-3">
            <label>
              最低提前分鐘
              <Input
                name="minNoticeMinutes"
                type="number"
                min={0}
                max={525600}
                required
                defaultValue={tenant.minNoticeMinutes}
              />
            </label>
            <label>
              最遠預約天數
              <Input
                name="maxAdvanceDays"
                type="number"
                min={1}
                max={365}
                required
                defaultValue={tenant.maxAdvanceDays}
              />
            </label>
            <label>
              時段間隔分鐘
              <Input
                name="slotIntervalMinutes"
                type="number"
                min={5}
                max={120}
                required
                defaultValue={tenant.slotIntervalMinutes}
              />
            </label>
            <Button>儲存預約政策</Button>
          </fieldset>
        </form>
      </Card>
      {!staff.length && <Card>請先新增服務人員，再設定個別排班。</Card>}
      {staff.map((s) => (
        <EmployeeSchedule
          key={JSON.stringify(s)}
          staff={s}
          services={services}
          disabled={disabled}
          save={(body) => save(base + "schedule", body)}
        />
      ))}
    </div>
  );
}
function EmployeeSchedule({
  staff,
  services,
  disabled,
  save,
}: {
  staff: ScheduleStaff;
  services: { id: string; name: string }[];
  disabled: boolean;
  save: (body: unknown) => Promise<boolean>;
}) {
  const [custom, setCustom] = useState(staff.customSchedule);
  const [schedule, setSchedule] = useState(staff.schedule);
  const [absences, setAbsences] = useState(staff.absences);
  const [ids, setIds] = useState(staff.services.map((s) => s.serviceId));
  return (
    <Card>
      <h2 className="mb-5 text-lg font-bold">{staff.name} 的排班</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await save({
            staffId: staff.id,
            customSchedule: custom,
            serviceIds: ids,
            schedule,
            absences,
          });
        }}
      >
        <fieldset disabled={disabled} className="space-y-5">
          <fieldset>
            <legend className="mb-3 font-semibold">可提供的服務</legend>
            <div className="flex flex-wrap gap-4">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ids.includes(s.id)}
                    onChange={(e) =>
                      setIds(
                        e.target.checked
                          ? [...ids, s.id]
                          : ids.filter((id) => id !== s.id),
                      )
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={custom}
              onChange={(e) => setCustom(e.target.checked)}
            />
            使用員工專屬工作時間
          </label>
          <p className="text-sm text-slate-500">
            未勾選時沿用店家營業時間。專屬班表沒有工作區間的星期視為休假；休息區間也適用沿用模式。
          </p>
          {schedule.map((h, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <label>
                星期
                <select
                  aria-label="星期"
                  value={h.weekday}
                  onChange={(e) =>
                    setSchedule(
                      schedule.map((x, j) =>
                        i === j ? { ...x, weekday: Number(e.target.value) } : x,
                      ),
                    )
                  }
                >
                  {weekdays.map((d, w) => (
                    <option key={w} value={w}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                區間類型
                <select
                  aria-label="區間類型"
                  value={h.kind}
                  onChange={(e) =>
                    setSchedule(
                      schedule.map((x, j) =>
                        i === j ? { ...x, kind: e.target.value } : x,
                      ),
                    )
                  }
                >
                  <option value="WORK">工作</option>
                  <option value="BREAK">休息</option>
                </select>
              </label>
              <label>
                開始時間
                <Input
                  type="time"
                  required
                  value={clock(h.openMinute)}
                  onChange={(e) =>
                    setSchedule(
                      schedule.map((x, j) =>
                        i === j
                          ? { ...x, openMinute: minute(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                結束時間
                <Input
                  type="time"
                  required
                  value={clock(h.closeMinute)}
                  onChange={(e) =>
                    setSchedule(
                      schedule.map((x, j) =>
                        i === j
                          ? { ...x, closeMinute: minute(e.target.value, true) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSchedule(schedule.filter((_, j) => j !== i))}
              >
                移除班段 {i + 1}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setSchedule([
                ...schedule,
                {
                  weekday: 1,
                  openMinute: 540,
                  closeMinute: 1080,
                  kind: "WORK",
                },
              ])
            }
          >
            新增班段
          </Button>
          <h3 className="font-semibold">指定日期請假／臨時停班</h3>
          {absences.map((a, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <label>
                停班日期
                <Input
                  type="date"
                  required
                  value={a.date}
                  onChange={(e) =>
                    setAbsences(
                      absences.map((x, j) =>
                        i === j ? { ...x, date: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                停班開始
                <Input
                  type="time"
                  required
                  value={clock(a.openMinute)}
                  onChange={(e) =>
                    setAbsences(
                      absences.map((x, j) =>
                        i === j
                          ? { ...x, openMinute: minute(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                停班結束
                <Input
                  type="time"
                  required
                  value={clock(a.closeMinute)}
                  onChange={(e) =>
                    setAbsences(
                      absences.map((x, j) =>
                        i === j
                          ? { ...x, closeMinute: minute(e.target.value, true) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                停班原因
                <Input
                  maxLength={200}
                  value={a.reason}
                  onChange={(e) =>
                    setAbsences(
                      absences.map((x, j) =>
                        i === j ? { ...x, reason: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAbsences(absences.filter((_, j) => j !== i))}
              >
                移除停班 {i + 1}
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setAbsences([
                  ...absences,
                  { date: "", openMinute: 0, closeMinute: 1440, reason: "" },
                ])
              }
            >
              新增停班日期
            </Button>
            <Button>儲存 {staff.name} 排班</Button>
          </div>
        </fieldset>
      </form>
    </Card>
  );
}
