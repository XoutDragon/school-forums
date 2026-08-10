"use client";

import { useEffect, useState } from "react";
import { Id } from "@/convex/_generated/dataModel";

const KEY = "campus-hub-user-id";

// Mock-auth session: just remembers the logged-in user's id in localStorage.
// Swap this out once real school SSO is wired up — every page below reads
// the current user through this hook, so that's the only place to change.
export function useSession() {
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    if (stored) setUserId(stored as Id<"users">);
    setLoaded(true);
  }, []);

  const login = (id: Id<"users">) => {
    localStorage.setItem(KEY, id);
    setUserId(id);
  };

  const logout = () => {
    localStorage.removeItem(KEY);
    setUserId(null);
  };

  return { userId, loaded, login, logout };
}
