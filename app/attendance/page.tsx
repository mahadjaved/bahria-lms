"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { LoadingView, ErrorView, EmptyView } from "@/components/portal-page-view";
import { PortalTableView } from "@/components/portal-table";
import type { AttendanceResult } from "@/lib/bahria/types";

export default function AttendancePage() {
  const [data, setData] = useState<AttendanceResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/attendance").then(async (r) => {
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Failed to load attendance");
      setData({ page: d.page, courses: d.courses || [] });
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);
  if (error) return <ErrorView message={error} />;
  if (!data) return <LoadingView />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">Per course, from the portal&apos;s attendance detail pages. Percentages are computed from the session hours on each detail page.</p>
      </div>
      {data.courses.length === 0 && data.page.tables.length === 0 && <EmptyView title="Attendance" />}
      {data.courses.map((course, ci) => {
        const title = course.info.find(([k]) => /title|course/i.test(k))?.[1] || course.course.filter(Boolean).join(" — ") || `Course ${ci + 1}`;
        const teacher = course.info.find(([k]) => /teacher/i.test(k))?.[1];
        return (
          <Card key={ci}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">{title}</CardTitle>
                  {teacher && <p className="text-sm text-muted-foreground mt-1">{teacher}</p>}
                </div>
                {course.percentage !== null && (
                  <Badge variant={course.percentage >= 75 ? "secondary" : "outline"}>{course.percentage}%</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {course.percentage !== null && <Progress value={course.percentage} />}
              <p className="text-sm text-muted-foreground">
                Present {course.presentHours} of {course.totalHours} hours
                {course.absentHours > 0 ? ` · ${course.absentHours} absent` : ""}
              </p>
              {course.sessions && course.sessions.rows.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium hover:underline underline-offset-2">
                    Class sessions ({course.sessions.rows.length})
                  </summary>
                  <div className="pt-3"><PortalTableView table={course.sessions} /></div>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })}
      {data.courses.length === 0 && data.page.tables.map((table, i) => (
        <Card key={i}><CardContent className="pt-6"><PortalTableView table={table} /></CardContent></Card>
      ))}
    </div>
  );
}
