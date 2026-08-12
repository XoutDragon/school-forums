"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/lib/session";

export default function Home() {
  const router = useRouter();
  const { userId, loaded } = useSession();
  const config = useQuery(api.admin.getConfig);
  const user = useQuery(api.users.getUser, userId ? { userId } : "skip");

  useEffect(() => {
    if (config === undefined) return; // still loading
    if (!config || !config.setupComplete) {
      router.replace("/admin/setup");
      return;
    }
    if (!loaded) return;
    if (!userId) {
      router.replace("/login");
      return;
    }
    if (user === undefined) return; // still loading
    if (user === null) {
      router.replace("/login");
      return;
    }
    router.replace(user.onboarded ? "/discover" : "/onboarding");
  }, [loaded, userId, user, router, config]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
      Loading...
    </main>
  );
}
