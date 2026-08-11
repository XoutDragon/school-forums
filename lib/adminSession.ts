"use client";

import { useEffect, useState } from "react";

const KEY = "campus-hub-admin-token";

export function useAdminSession() {
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem(KEY));
    setLoaded(true);
  }, []);

  const login = (t: string) => {
    localStorage.setItem(KEY, t);
    setToken(t);
  };

  const logout = () => {
    localStorage.removeItem(KEY);
    setToken(null);
  };

  return { token, loaded, login, logout };
}
