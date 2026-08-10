"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useSession();
  const loginOrCreate = useMutation(api.users.loginOrCreate);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // MVP domain check placeholder — swap for real SSO validation later.
    if (!email.endsWith("@student.edu") && !email.endsWith("@alumni.edu")) {
      setError("Please use your school (@student.edu) or alumni (@alumni.edu) email.");
      return;
    }

    setSubmitting(true);
    try {
      const userId = await loginOrCreate({ name, email });
      login(userId);
      router.push("/");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent mx-auto mb-4 flex items-center justify-center text-xl font-semibold">
            CH
          </div>
          <h1 className="text-xl font-semibold text-text">Sign in to Campus Hub</h1>
          <p className="text-sm text-muted mt-1">Use your school or alumni email to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-panel border border-border rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Full name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jordan Smith"
              className="w-full rounded-lg bg-panel2 border border-border px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">School email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jsmith@student.edu"
              className="w-full rounded-lg bg-panel2 border border-border px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent text-white text-sm font-medium py-2.5 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Signing in..." : "Continue"}
          </button>

          <p className="text-[11px] text-muted text-center pt-1">
            Mock auth for MVP — any @student.edu / @alumni.edu email works. Swap in real SSO before launch.
          </p>
        </form>
      </div>
    </main>
  );
}
