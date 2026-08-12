"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminSession } from "@/lib/adminSession";

export default function AdminSetupPage() {
  const router = useRouter();
  const config = useQuery(api.admin.getConfig);
  const setup = useMutation(api.admin.setup);
  const { login } = useAdminSession();

  const [institutionName, setInstitutionName] = useState("");
  const [domains, setDomains] = useState("student.edu, alumni.edu");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If someone lands here after setup is already done, bounce them along.
  useEffect(() => {
    if (config?.setupComplete) router.replace("/admin/login");
  }, [config, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Master password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await setup({
        institutionName,
        allowedDomains: domains.split(",").map((d) => d.trim()).filter(Boolean),
        password,
      });
      login(token);
      router.push("/admin/dashboard");
    } catch (err: any) {
      setError(err.data ?? err.message ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (config === undefined) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading...
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary mx-auto mb-4 flex items-center justify-center text-xl font-semibold">
            CH
          </div>
          <h1 className="text-xl font-semibold text-foreground">Welcome to Campus Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This site hasn't been set up yet. Configure it for your school before students can
            sign in.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Institution name</label>
            <input
              required
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              placeholder="Lincoln High School"
              className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Allowed email domains (comma-separated)
            </label>
            <input
              required
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="student.edu, alumni.edu"
              className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Only students/alumni with an email on one of these domains can sign in.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Master admin password</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Confirm password</label>
            <input
              required
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary text-white text-sm font-medium py-2.5 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Setting up..." : "Finish setup"}
          </button>

          <p className="text-[11px] text-muted-foreground text-center pt-1">
            This password protects the admin dashboard. Store it somewhere your IT team can find
            it — there's no recovery flow in this MVP.
          </p>
        </form>
      </div>
    </main>
  );
}
