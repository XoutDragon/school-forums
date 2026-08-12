"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useSession();
  const loginOrCreate = useMutation(api.users.loginOrCreate);
  const config = useQuery(api.admin.getConfig);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If this instance hasn't been configured yet, send whoever lands here
  // to the setup wizard instead of letting them try to sign in.
  useEffect(() => {
    if (config !== undefined && (!config || !config.setupComplete)) {
      router.replace("/admin/setup");
    }
  }, [config, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const domains = config?.allowedDomains ?? [];
    const normalizedEmail = email.trim().toLowerCase();
    const matchesDomain = domains.some((d) =>
      normalizedEmail.endsWith(`@${d}`),
    );

    if (!matchesDomain) {
      setError(
        domains.length > 0
          ? `Please use an email ending in ${domains.map((d) => `@${d}`).join(" or ")}.`
          : "Sign-in isn't configured for this instance yet.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const userId = await loginOrCreate({ name, email: normalizedEmail });
      login(userId);
      router.push("/");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary mx-auto mb-4 flex items-center justify-center text-xl font-semibold">
            CH
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            Sign in to {config?.institutionName ?? "Campus Hub"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Use your school or alumni email to continue.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card border border-border rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Full name
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jordan Smith"
              className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              School email
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={
                config?.allowedDomains?.[0]
                  ? `jsmith@${config.allowedDomains[0]}`
                  : "jsmith@school.edu"
              }
              className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary text-white text-sm font-medium py-2.5 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Signing in..." : "Continue"}
          </button>

          <p className="text-[11px] text-muted-foreground text-center pt-1">
            Mock auth for MVP — any email on an approved domain works. Swap in
            real SSO before launch.
          </p>
        </form>

        <p className="text-center mt-4">
          <Link
            href="/admin/login"
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            IT staff — admin login
          </Link>
        </p>
      </div>
    </main>
  );
}
