"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? "/documents" : "/login");
    }
  }, [user, loading, router]);

  // If unauthenticated, redirect immediately after brief initialization
  useEffect(() => {
    const timer = setTimeout(() => {
      const token = typeof window !== "undefined" ? localStorage.getItem("trustvault_token") : null;
      if (!token) {
        router.replace("/login");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F8FC]">
      <div className="spinner" style={{ width: 36, height: 36 }} />
    </div>
  );
}
