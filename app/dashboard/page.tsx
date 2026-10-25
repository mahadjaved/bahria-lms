"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingView, ErrorView } from "@/components/portal-page-view";
import { PortalTableView } from "@/components/portal-table";
import type { PortalPage } from "@/lib/bahria/types";

const SHORTCUTS = [
  { href: "/courses", title: "Courses", desc: "Enrolled courses and materials" },
  { href: "/attendance", title: "Attendance", desc: "Attendance by course" },
  { href: "/marks", title: "Marks", desc: "Results and assessments" },
  { href: "/timetable", title: "Timetable", desc: "Weekly class schedule" },
  { href: "/fee", title: "Fee", desc: "Fee details and challans" },
  { href: "/profile", title: "Profile", desc: "Your student profile" }
];

export default function DashboardPage() {
  const [page, setPage] = useState<PortalPage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/dashboard").then(async (r) => {
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Failed to load dashboard");
      setPage(d.page);
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);
  if (error) return <ErrorView message={error} />;
  if (!page) return <LoadingView />;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1><p className="text-sm text-muted-foreground mt-1">{page.title || "Welcome to Bahria University"}</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SHORTCUTS.map((s) => (
          <Link key={s.href} href={s.href}><Card className="hover:bg-zinc-50 transition-colors"><CardHeader><CardTitle className="text-base">{s.title}</CardTitle><CardDescription>{s.desc}</CardDescription></CardHeader></Card></Link>
        ))}
      </div>
      {page.tables.map((table, i) => (
        <Card key={i}><CardHeader><CardTitle className="text-base">{page.headings[i] || "From the portal"}</CardTitle></CardHeader><CardContent><PortalTableView table={table} /></CardContent></Card>
      ))}
      {page.tables.length === 0 && <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">The portal dashboard returned no tables. Use the shortcuts above — each section fetches its own page directly from Bahria.</p></CardContent></Card>}
    </div>
  );
}
