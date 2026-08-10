"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/lib/session";

export default function Home() {
  const router = useRouter();
  const { userId, loaded } = useSession();
  const user = useQuery(api.users.getUser, userId ? { userId } : "skip");

  useEffect(() => {
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
  }, [loaded, userId, user, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg text-muted">
      Loading...
    </main>
  );
}
