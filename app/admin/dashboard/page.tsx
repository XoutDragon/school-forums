"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminSession } from "@/lib/adminSession";
import AdminLogsPanel from "@/components/AdminLogsPanel";
import AdminTopicsManager from "@/components/AdminTopicsManager";
import AdminInterestsManager from "@/components/AdminInterestsManager";
import clsx from "clsx";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "logs", label: "Logs" },
  { key: "topics", label: "Topics & members" },
  { key: "interests", label: "Majors & interests" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function AdminDashboardPage() {
  const router = useRouter();
  const { token, loaded, logout } = useAdminSession();
  const isValid = useQuery(api.admin.validateSession, token ? { token } : "skip");
  const stats = useQuery(api.admin.overviewStats, token ? { token } : "skip");
  const config = useQuery(api.admin.getConfig);

  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!loaded) return;
    if (!token || isValid === false) router.replace("/admin/login");
  }, [loaded, token, isValid, router]);

  if (!token || isValid === undefined || isValid === false) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-bg text-muted text-sm">
        Checking session...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text">Admin dashboard</h1>
          <p className="text-xs text-muted">{config?.institutionName}</p>
        </div>
        <button
          onClick={() => {
            logout();
            router.push("/admin/login");
          }}
          className="text-xs text-muted hover:text-text"
        >
          Log out
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex gap-1 mb-6 bg-panel border border-border rounded-lg p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                "px-3.5 py-1.5 rounded-md text-sm font-medium transition",
                tab === t.key ? "bg-accent text-white" : "text-muted hover:text-text"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <StatCard label="Users" value={stats?.userCount} />
              <StatCard label="Topics" value={stats?.topicCount} />
              <StatCard label="Channels" value={stats?.channelCount} />
              <StatCard label="Threads" value={stats?.threadCount} />
            </div>

            <div className="bg-panel border border-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-text mb-2">Instance settings</h2>
              <p className="text-xs text-muted">
                Institution: <span className="text-text">{config?.institutionName}</span>
              </p>
              <p className="text-xs text-muted mt-1">
                Allowed sign-in domains:{" "}
                <span className="text-text">{config?.allowedDomains.join(", ")}</span>
              </p>
              <p className="text-[11px] text-muted mt-3">
                Editing these settings isn't wired up in this MVP yet — update the
                `institutionConfig` row directly in the Convex dashboard for now.
              </p>
            </div>
          </div>
        )}

        {tab === "logs" && <AdminLogsPanel token={token} />}
        {tab === "topics" && <AdminTopicsManager token={token} />}
        {tab === "interests" && <AdminInterestsManager token={token} />}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="bg-panel border border-border rounded-lg px-4 py-3">
      <p className="text-2xl font-semibold text-text">{value ?? "–"}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}
