import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
export const metadata: Metadata = { title: "Bahria LMS — Bahria University", description: "A clean, modern interface for the Bahria University student portal." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><AppShell>{children}</AppShell></body></html>);
}
