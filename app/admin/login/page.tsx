"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminSession } from "@/lib/adminSession";

export default function AdminLoginPage() {
  const router = useRouter();
  const { login } = useAdminSession();
  const loginMutation = useMutation(api.admin.login);

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const token = await loginMutation({ password });
      login(token);
      router.push("/admin/dashboard");
    } catch (err: any) {
      setError(err.data ?? err.message ?? "Incorrect password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-secondary border border-border mx-auto mb-4 flex items-center justify-center text-xl">
            🔒
          </div>
          <h1 className="text-xl font-semibold text-foreground">Admin dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter the master password to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <input
            required
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Master password"
            className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary text-white text-sm font-medium py-2.5 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Checking..." : "Log in"}
          </button>
        </form>
      </div>
    </main>
  );
}
