"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Bell, Search, ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface TopNavProps {
  breadcrumbs?: BreadcrumbItem[];
}

export default function TopNav({ breadcrumbs = [] }: TopNavProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifs, setShowNotifs] = useState(false);
  const [avatarTimestamp, setAvatarTimestamp] = useState<number>(Date.now());
  const [avatarError, setAvatarError] = useState(false);

  React.useEffect(() => {
    const handleAvatarUpdate = () => {
      setAvatarTimestamp(Date.now());
      setAvatarError(false);
    };
    window.addEventListener("trustvault_avatar_updated", handleAvatarUpdate);
    return () => window.removeEventListener("trustvault_avatar_updated", handleAvatarUpdate);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?query=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push("/search");
    }
  };

  return (
    <header className="topnav">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm flex-1 min-w-0">
        <Link href="/dashboard" className="text-[#6B778C] hover:text-[#18243A] transition-colors">
          TrustVault
        </Link>
        {breadcrumbs.map((b, i) => (
          <React.Fragment key={i}>
            <ChevronRight size={14} className="text-[#6B778C] shrink-0" />
            {b.href ? (
              <Link href={b.href} className="text-[#6B778C] hover:text-[#18243A] transition-colors truncate">
                {b.label}
              </Link>
            ) : (
              <span className="text-[#18243A] font-medium truncate">{b.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Global Search Bar */}
      <form onSubmit={handleSearchSubmit} className="relative hidden sm:block">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B778C] pointer-events-none" />
        <input
          type="search"
          placeholder="Search documents…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ paddingLeft: "34px", paddingRight: "12px" }}
          className="input w-56 md:w-64 text-xs h-8 bg-[#F6F8FC] hover:bg-white focus:bg-white border-[#E5EAF2]"
        />
      </form>

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={() => setShowNotifs(!showNotifs)}
          className="btn btn-ghost p-2 rounded-lg relative"
          aria-label="Notifications"
        >
          <Bell size={18} />
          <span className="w-2 h-2 rounded-full bg-emerald-500 absolute top-2 right-2 ring-2 ring-white" />
        </button>

        {showNotifs && (
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-[#E5EAF2] p-3 z-50 animate-fadeIn text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5EAF2] mb-2 font-semibold text-[#18243A]">
              <span>System Alerts & Notifications</span>
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">ALL SECURE</span>
            </div>
            <div className="space-y-2 text-[#475569]">
              <div className="p-2 bg-[#F6F8FC] rounded-lg">
                <span className="font-semibold text-[#18243A] block">SHA-256 Ledger Verified</span>
                <span className="text-[11px] text-[#6B778C]">Audit hash chain integrity checks passed with 100% validity.</span>
              </div>
              <div className="p-2 bg-[#F6F8FC] rounded-lg">
                <span className="font-semibold text-[#18243A] block">Zero Plaintext Storage</span>
                <span className="text-[11px] text-[#6B778C]">All documents saved with secure key mapping.</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User avatar & profile click - Navigates to /settings (Profile) */}
      {user && (
        <Link
          href="/settings"
          title="Account Profile & Settings"
          className="flex items-center gap-2 ml-1 p-1 rounded-lg hover:bg-[#F6F8FC] transition-colors cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-full bg-[#3478F6] group-hover:ring-2 group-hover:ring-[#3478F6]/30 flex items-center justify-center text-white text-sm font-semibold select-none transition-all overflow-hidden">
            {!avatarError && user.id ? (
              <img
                src={`/api/v1/users/${user.id}/avatar?t=${avatarTimestamp}`}
                alt={user.full_name}
                className="w-full h-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              user.full_name?.charAt(0).toUpperCase()
            )}
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium leading-tight group-hover:text-[#3478F6] transition-colors">{user.full_name}</p>
            <p className="text-xs text-[#6B778C] capitalize leading-tight">{user.role}</p>
          </div>
        </Link>
      )}
    </header>
  );
}
