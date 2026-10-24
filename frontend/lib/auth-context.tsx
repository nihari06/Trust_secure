"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "./api";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "owner" | "viewer" | "editor";
  is_active: boolean;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("trustvault_token");
    if (storedToken) {
      setToken(storedToken);
      authApi
        .me()
        .then((u) => setUser(u))
        .catch(() => {
          // Token is invalid or expired — clear it so user sees login
          localStorage.removeItem("trustvault_token");
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    localStorage.setItem("trustvault_token", data.access_token);
    setToken(data.access_token);
    const me = await authApi.me();
    setUser(me);
  };

  const logout = async () => {
    try { await authApi.logout(); } catch {}
    localStorage.removeItem("trustvault_token");
    setToken(null);
    setUser(null);
    // Use router-style navigation instead of hard page reload
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
