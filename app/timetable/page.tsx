"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PortalPageView, LoadingView, ErrorView, EmptyView } from "@/components/portal-page-view";
import type { TimetableResult } from "@/lib/bahria/types";

// The portal's eventsData entries (verified shape):
// { resourceID, weekDay, timeSlot, timing, timeTableSlotID, processSlotWise,
//   data: { courseTitle, className, facultyMemberName, roomName, buildingName, ... } }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CalEvent = { weekDay?: unknown; timeSlot?: unknown; timing?: unknown; name?: unknown; data?: Record<string, any> };

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function groupKey(ev: CalEvent): string {
  const v = ev.weekDay ?? (ev.data || {}).weekDay;
  if (typeof v === "string" && v) return v;
  if (typeof v === "number") return String(v);
  return "";
}
function groupTitle(key: string): string {
  const n = parseInt(key, 10);
  if (/^\d+$/.test(key) && n >= 1 && n <= 7) return DAY_NAMES[n - 1];
  return key;
}
function groupOrder(key: string): number {
  const n = parseInt(key, 10);
  if (/^\d+$/.test(key)) return n;
  const idx = DAY_NAMES.findIndex((d) => d.toLowerCase() === key.toLowerCase());
  return idx >= 0 ? idx + 1 : 99;
}

const HIDDEN_KEYS = new Set(["cssClass", "calendarType", "registered", "courseTitle"]);
/** Display fields for an event: timing first, then the data bag minus ids/short duplicates. */
function eventFields(ev: CalEvent): [string, string][] {
  const out: [string, string][] = [];
  if (typeof ev.timing === "string" && ev.timing) out.push(["timing", ev.timing]);
  else if (typeof ev.timeSlot === "string" && ev.timeSlot) out.push(["timeSlot", ev.timeSlot]);
  const d = (ev.data || {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(d)) {
    if (typeof v !== "string" && typeof v !== "number") continue;
    if (HIDDEN_KEYS.has(k) || /id$/i.test(k)) continue;
    if (k.startsWith("short") && k.length > 5) {
      const longKey = k.charAt(5).toLowerCase() + k.slice(6);
      if (longKey in d) continue; // the long version is shown instead
    }
    out.push([k, String(v)]);
  }
  return out;
}
function eventName(ev: CalEvent): string {
  const t = (ev.data || {}).courseTitle;
  if (typeof t === "string" && t) return t;
  if (typeof ev.name === "string" && ev.name) return ev.name;
  return "Class";
}

export default function TimetablePage() {
  const [data, setData] = useState<TimetableResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/timetable").then(async (r) => {
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Failed to load timetable");
      setData({ page: d.page, calendar: d.calendar || null });
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);
  if (error) return <ErrorView message={error} />;
  if (!data) return <LoadingView />;

  const cal = data.calendar;
  const events: CalEvent[] = cal && Array.isArray(cal.eventsData) ? (cal.eventsData as CalEvent[]) : [];
  if (!cal || events.length === 0) {
    // No calendar JSON (or no events in it): show whatever the portal page itself carried.
    if (data.page.tables.length === 0 && !data.page.headings.length) return <EmptyView title="Timetable" />;
    return <PortalPageView page={data.page} title="Timetable" />;
  }

  const groups = new Map<string, CalEvent[]>();
  for (const ev of events) {
    const key = groupKey(ev);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => groupOrder(a[0]) - groupOrder(b[0]));
  const caption = typeof cal.tableCaption === "string" ? cal.tableCaption : "";
  const semester = typeof cal.semester === "string" ? cal.semester : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Timetable</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {caption || "Your class schedule from the portal."}{semester ? ` · ${semester}` : ""}
        </p>
      </div>
      {sortedGroups.map(([day, evs], gi) => (
        <Card key={gi}>
          {day && <CardHeader><CardTitle className="text-base">{groupTitle(day)}</CardTitle></CardHeader>}
          <CardContent className={day ? undefined : "pt-6"}>
            <ul className="divide-y">
              {evs.map((ev, ei) => {
                const fields = eventFields(ev);
                const className = (ev.data || {}).className;
                return (
                  <li key={ei} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{eventName(ev)}</span>
                      {typeof className === "string" && className && <Badge variant="outline">{className}</Badge>}
                    </div>
                    {fields.length > 0 && (
                      <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                        {fields.map(([k, v], fi) => (
                          <div key={fi} className="text-xs">
                            <dt className="inline text-muted-foreground">{k}: </dt>
                            <dd className="inline font-medium">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
