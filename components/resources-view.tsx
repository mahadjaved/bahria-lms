"use client";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingView, ErrorView } from "@/components/portal-page-view";
import type { CourseResources } from "@/lib/bahria/types";

export function ResourcesView({ apiPath, title, emptyHint }: { apiPath: string; title: string; emptyHint: string }) {
  const [data, setData] = useState<CourseResources | null>(null);
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
        <p className="text-sm text-muted-foreground mt-1">Collected live from your courses on the Bahria portal, grouped by course.</p>
      </div>
      {data.groups.length === 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nothing found yet</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{emptyHint} Nothing has been fabricated — this is exactly what the portal returned. If you expected items here, open Portal diagnostics from the dashboard to check which portal URLs were resolved.</p>
          </CardContent>
        </Card>
      )}
      {data.groups.map((group, gi) => (
        <Card key={gi}>
          <CardHeader>
            <CardTitle className="text-base">{group.course}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {group.items.map((item, ii) => (
                <li key={ii} className="py-2.5 first:pt-0 last:pb-0">
                  <a href={item.href} target="_blank" rel="noreferrer" className="group flex items-start gap-2 text-sm hover:underline">
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{item.title}</span>
                    <Badge variant="outline" className="shrink-0 capitalize">{item.kind}</Badge>
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
