"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { LoadingView, ErrorView, EmptyView } from "@/components/portal-page-view";
import { PortalTableView } from "@/components/portal-table";
import type { PortalPage } from "@/lib/bahria/types";

interface AttRow { cells: string[]; percentage: number | null; }
interface AttTable { headers: string[]; rows: AttRow[]; }

export default function AttendancePage() {
  const [page, setPage] = useState<PortalPage | null>(null);
  const [attendance, setAttendance] = useState<AttTable[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/attendance").then(async (r) => {
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Failed to load attendance");
      setPage(d.page); setAttendance(d.attendance || []);
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);
  if (error) return <ErrorView message={error} />;
  if (!page) return <LoadingView />;
  const hasPercentages = attendance.some((t) => t.rows.some((r) => r.percentage !== null));
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">Attendance</h1><p className="text-sm text-muted-foreground mt-1">Fetched directly from the Bahria portal.</p></div>
      {!page.tables.length && <EmptyView title="Attendance" />}
      {hasPercentages && attendance.map((table, ti) => (
        <Card key={ti}><CardHeader><CardTitle className="text-base">Attendance by course</CardTitle></CardHeader><CardContent className="space-y-4">
          {table.rows.map((row, ri) => (
            <div key={ri} className="space-y-1.5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium truncate">{row.cells[0] || `Course ${ri + 1}`}{row.cells[1] ? ` — ${row.cells[1]}` : ""}</span>
                {row.percentage !== null && <Badge variant={row.percentage >= 75 ? "secondary" : "outline"}>{row.percentage}%</Badge>}
              </div>
              {row.percentage !== null && <Progress value={row.percentage} />}
            </div>
          ))}
        </CardContent></Card>
      ))}
      {page.tables.map((table, i) => (
        <Card key={i}><CardContent className="pt-6"><PortalTableView table={table} /></CardContent></Card>
      ))}
    </div>
  );
}
