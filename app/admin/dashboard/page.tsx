"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminSession } from "@/lib/adminSession";
import AdminLogsPanel from "@/components/AdminLogsPanel";
import AdminTopicsManager from "@/components/AdminTopicsManager";
import AdminInterestsManager from "@/components/AdminInterestsManager";

import { AppSidebar, type AdminTab } from "./_components/app-sidebar";
import { SiteHeader } from "./_components/site-header";
import { SectionCards } from "./_components/section-cards";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const TAB_TITLES: Record<AdminTab, string> = {
  overview: "Overview",
  logs: "Logs",
  topics: "Topics & members",
  interests: "Majors & interests",
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const { token, loaded, logout } = useAdminSession();
  const isValid = useQuery(
    api.admin.validateSession,
    token ? { token } : "skip",
  );
  const stats = useQuery(api.admin.overviewStats, token ? { token } : "skip");
  const config = useQuery(api.admin.getConfig);

  const [tab, setTab] = useState<AdminTab>("overview");

  useEffect(() => {
    if (!loaded) return;
    if (!token || isValid === false) router.replace("/admin/login");
  }, [loaded, token, isValid, router]);

  if (!token || isValid === undefined || isValid === false) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Checking session...
      </main>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        institutionName={config?.institutionName}
        activeTab={tab}
        onTabChange={setTab}
        onLogout={() => {
          logout();
          router.push("/admin/login");
        }}
      />
      <SidebarInset>
        <SiteHeader title={TAB_TITLES[tab]} />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              {tab === "overview" && (
                <>
                  <SectionCards stats={stats} />
                  <div className="px-4 lg:px-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">
                          Instance settings
                        </CardTitle>
                        <CardDescription>
                          Configuration for this deployment
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs text-muted-foreground">
                        <p>
                          Institution:{" "}
                          <span className="font-medium text-foreground">
                            {config?.institutionName}
                          </span>
                        </p>
                        <p>
                          Allowed sign-in domains:{" "}
                          <span className="font-medium text-foreground">
                            {config?.allowedDomains.join(", ")}
                          </span>
                        </p>
                        <Separator className="my-3" />
                        <p className="flex items-center gap-2 text-[11px]">
                          <Badge variant="outline" className="font-normal">
                            MVP
                          </Badge>
                          Editing these settings isn&apos;t wired up yet —
                          update the{" "}
                          <code className="mx-1 rounded bg-muted px-1 py-0.5">
                            institutionConfig
                          </code>
                          row directly in the Convex dashboard for now.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}

              {tab === "logs" && (
                <div className="px-4 lg:px-6">
                  <AdminLogsPanel token={token} />
                </div>
              )}
              {tab === "topics" && (
                <div className="px-4 lg:px-6">
                  <AdminTopicsManager token={token} />
                </div>
              )}
              {tab === "interests" && (
                <div className="px-4 lg:px-6">
                  <AdminInterestsManager token={token} />
                </div>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
