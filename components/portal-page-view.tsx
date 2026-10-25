"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalTableView } from "@/components/portal-table";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortalPage } from "@/lib/bahria/types";

export function LoadingView() {
  return (<div className="space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>);
}
export function ErrorView({ message }: { message: string }) {
  return (<Card><CardHeader><CardTitle>Could not load this page</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{message}</p></CardContent></Card>);
}
export function EmptyView({ title }: { title: string }) {
  return (<Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>
    <p className="text-sm text-muted-foreground">Bahria portal returned no table for this page. This can happen when there is nothing published yet for the current semester, or when the portal page name differs for your campus. No data has been fabricated — this is exactly what the portal returned.</p>
  </CardContent></Card>);
}
export function PortalPageView({ page, title }: { page: PortalPage; title: string }) {
  if (!page.tables.length && !page.headings.length) return <EmptyView title={title} />;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {page.title && page.title !== title && <p className="text-sm text-muted-foreground mt-1">{page.title}</p>}</div>
      {page.tables.length === 0 ? <EmptyView title={title} /> : page.tables.map((table, i) => (
        <Card key={i}><CardContent className="pt-6"><PortalTableView table={table} /></CardContent></Card>
      ))}
      {page.links.length > 0 && (
        <Card><CardHeader><CardTitle className="text-base">Links from the portal</CardTitle></CardHeader><CardContent>
          <ul className="space-y-1 text-sm">{page.links.slice(0, 40).map((l, i) => <li key={i} className="text-muted-foreground">{l.text || l.href}</li>)}</ul>
        </CardContent></Card>
      )}
    </div>
  );
}
