"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { INSTITUTES, SUB_USER_TYPES } from "@/lib/bahria/constants";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState("");
  const [password, setPassword] = useState("");
  const [instituteId, setInstituteId] = useState("1");
  const [subUserType, setSubUserType] = useState("None");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollment, password, instituteId, subUserType }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Login failed");
      router.replace("/dashboard"); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Login failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Bahria LMS</CardTitle>
          <CardDescription>Sign in with your Bahria University enrollment and portal password. Your credentials are sent only to Bahria and are never stored.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <Alert><AlertTitle>Login failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="space-y-2"><Label htmlFor="enrollment">Enrollment</Label><Input id="enrollment" value={enrollment} onChange={(e) => setEnrollment(e.target.value)} placeholder="e.g. 01-234567-001" required autoComplete="username" /></div>
            <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></div>
            <div className="space-y-2"><Label htmlFor="institute">Institute / Campus</Label>
              <Select id="institute" value={instituteId} onChange={(e) => setInstituteId(e.target.value)}>
                {INSTITUTES.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select></div>
            <div className="space-y-2"><Label htmlFor="type">Account type</Label>
              <Select id="type" value={subUserType} onChange={(e) => setSubUserType(e.target.value)}>
                {SUB_USER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select></div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
            <p className="text-center text-xs text-muted-foreground">This site connects directly to cms.bahria.edu.pk on your behalf.</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
