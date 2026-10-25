"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, ClipboardList, FileQuestion, FolderOpen, GraduationCap, LayoutDashboard, LogOut, Menu, NotebookPen, User, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/assignments", label: "Assignments", icon: NotebookPen },
  { href: "/quizzes", label: "Quizzes", icon: FileQuestion },
  { href: "/materials", label: "Lecture Notes", icon: FolderOpen },
  { href: "/attendance", label: "Attendance", icon: ClipboardList },
  { href: "/marks", label: "Marks", icon: GraduationCap },
  { href: "/timetable", label: "Timetable", icon: CalendarDays },
  { href: "/fee", label: "Fee", icon: Wallet },
  { href: "/profile", label: "Profile", icon: User }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string>("");
  const [enrollment, setEnrollment] = useState<string>("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (pathname === "/login") { setChecked(true); return; }
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.replace("/login"); return; }
      const d = await r.json();
      setName(d.user?.name || ""); setEnrollment(d.user?.enrollment || ""); setChecked(true);
    }).catch(() => router.replace("/login"));
  }, [pathname, router]);

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); }
  if (pathname === "/login") return <>{children}</>;
  if (!checked) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const nav = (
    <nav className="space-y-1 p-3">
      {NAV.map((item) => (
        <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
          className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground", pathname === item.href ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>
          <item.icon className="h-4 w-4" />{item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r bg-background md:block">
        <div className="flex h-14 items-center border-b px-4"><span className="font-semibold tracking-tight">Bahria LMS</span><span className="ml-2 text-xs text-muted-foreground">Bahria University</span></div>
        {nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-background shadow-lg">
            <div className="flex h-14 items-center justify-between border-b px-4"><span className="font-semibold">Bahria LMS</span>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button></div>
            {nav}
          </div>
        </div>
      )}
      <div className="md:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></Button>
          <div className="hidden md:block text-sm text-muted-foreground">Student Portal</div>
          <div className="flex items-center gap-3">
            <div className="text-right"><div className="text-sm font-medium leading-none">{name || enrollment || "Student"}</div>{name && enrollment && <div className="text-xs text-muted-foreground mt-1">{enrollment}</div>}</div>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={logout}><LogOut className="mr-2 h-4 w-4" />Log out</Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
