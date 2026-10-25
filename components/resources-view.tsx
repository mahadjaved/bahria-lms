"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingView, ErrorView } from "@/components/portal-page-view";
import { PortalTableView } from "@/components/portal-table";
import type { LmsFeatureResult } from "@/lib/bahria/types";

/**
 * Renders an LMS feature (assignments, quizzes, lecture notes, announcements):
 * the LMS's own data tables, grouped by course, with per-cell file links.
 */
export function ResourcesView({ apiPath, title, emptyHint }: { apiPath: string; title: string; emptyHint: string }) {
  const [data, setData] = useState<LmsFeatureResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(apiPath).then(async (r) => {
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Failed to load");
      setData({ groups: d.groups || [], sourcePages: d.sourcePages || [] });
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [apiPath]);

  if (error) return <ErrorView message={error} />;
  if (!data) return <LoadingView />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">Fetched live from the Bahria LMS for each of your courses.</p>
      </div>
      {data.groups.length === 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nothing found yet</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{emptyHint} Nothing has been fabricated — this is exactly what the LMS returned.</p>
          </CardContent>
        </Card>
      )}
      {data.groups.map((group, gi) => (
        <Card key={gi}>
          <CardHeader>
            <CardTitle className="text-base">{group.course}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.tables.map((table, ti) => <PortalTableView key={ti} table={table} />)}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
