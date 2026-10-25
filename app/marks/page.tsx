"use client";
import { useEffect, useState } from "react";
import { PortalPageView, LoadingView, ErrorView } from "@/components/portal-page-view";
import type { PortalPage } from "@/lib/bahria/types";
export default function Page() {
  const [page, setPage] = useState<PortalPage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/marks").then(async (r) => {
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Failed to load");
      setPage(d.page);
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);
  if (error) return <ErrorView message={error} />;
  if (!page) return <LoadingView />;
  return <PortalPageView page={page} title="Marks & Results" />;
}
