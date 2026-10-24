"use client";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard, FileText, Share2, Shield, ClipboardList,
  Users, Settings, LogOut, ChevronLeft, Menu, Lock, X,
  Search, FolderOpen, Plus
} from "lucide-react";

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

const BASE_NAV_ITEMS = [
  { href: "/dashboard",   label: "Dashboard",            icon: LayoutDashboard },
  { href: "/documents",   label: "My Documents",         icon: FileText },
  { href: "/search",      label: "Search Documents",     icon: Search },
  { href: "/categories",  label: "Categories",           icon: FolderOpen },
  { href: "/shared",      label: "Shared with Me",       icon: Share2 },
  { href: "/audit",       label: "Audit Trail",          icon: ClipboardList },
];

const PERMISSIONS_ITEM = {
  href: "/permissions",
  label: "Access & Permissions",
  icon: Shield,
};

const ADMIN_ITEMS = [
  { href: "/admin/users", label: "User Management", icon: Users },
];

const BOTTOM_ITEMS = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ collapsed: propCollapsed, onToggle }: SidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isCollapsed = propCollapsed !== undefined ? propCollapsed : internalCollapsed;
  const handleToggle = onToggle || (() => setInternalCollapsed(!internalCollapsed));

  const NavLink = ({ href, label, icon: Icon }: { href: string; label: string; icon: any }) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        onClick={() => setMobileOpen(false)}
        title={isCollapsed ? label : undefined}
        className={`flex items-center gap-3 rounded-lg mx-2 transition-all font-medium ${
          isCollapsed ? "px-0 py-2.5 justify-center" : "px-3 py-2 text-sm"
        } ${
          active
            ? "bg-[#3478F6] text-white shadow-sm"
            : "text-blue-200 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icon size={17} className="shrink-0" />
        {!isCollapsed && <span className="truncate tracking-wide">{label}</span>}
      </Link>
    );
  };

  const isOwnerOrAdmin = user?.role === "admin" || user?.role === "owner";
  const isAdmin = user?.role === "admin";

  const sidebarContent = (
    <aside
      className="sidebar flex flex-col"
      style={{ width: isCollapsed ? 64 : 240, transition: "width 0.22s ease" }}
    >
      {/* Logo */}
      <div className={`flex items-center border-b border-white/10 shrink-0 ${isCollapsed ? "justify-center px-0 py-4" : "gap-3 px-4 py-4"}`}>
        <div className="w-8 h-8 bg-[#3478F6] rounded-lg flex items-center justify-center shrink-0 shadow-sm">
          <Lock size={15} className="text-white" />
        </div>
        {!isCollapsed && (
          <span className="font-bold text-white text-lg tracking-tight flex-1">TrustVault</span>
        )}
        <button
          onClick={handleToggle}
          className="text-blue-300 hover:text-white transition-colors hidden md:flex items-center justify-center p-1 rounded hover:bg-white/10"
          aria-label="Toggle sidebar"
        >
          <ChevronLeft size={16} className={`transition-transform duration-200 ${isCollapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Nav list */}
      <nav className="flex-1 py-3 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
        {BASE_NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        {/* Only Admin & Owner can access Grant / Revoke Permissions */}
        {isOwnerOrAdmin && (
          <NavLink key={PERMISSIONS_ITEM.href} {...PERMISSIONS_ITEM} />
        )}

        {/* User Management strictly restricted to Admin */}
        {isAdmin && (
          <>
            <div className="mx-3 my-1.5 border-t border-white/10" />
            {ADMIN_ITEMS.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/10 pt-2 pb-3 shrink-0">
        {BOTTOM_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
        <button
          onClick={logout}
          title={isCollapsed ? "Sign out" : undefined}
          className={`flex items-center gap-3 rounded-lg mx-2 text-sm font-medium text-blue-200 hover:bg-white/10 hover:text-white transition-all ${
            isCollapsed ? "px-0 py-2.5 justify-center w-[calc(100%-16px)]" : "px-3 py-2 w-[calc(100%-16px)]"
          }`}
        >
          <LogOut size={17} className="shrink-0" />
          {!isCollapsed && <span>Sign out</span>}
        </button>

        {/* User profile block */}
        {!isCollapsed && user && (
          <div className="mx-2 mt-2 px-3 py-2 bg-white/8 rounded-lg border border-white/10">
            <p className="text-white text-sm font-semibold truncate leading-tight">{user.full_name}</p>
            <p className="text-blue-200/80 text-xs truncate leading-tight mt-0.5">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3478F6] ring-2 ring-[#3478F6]/30" />
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#3478F6]/30 text-blue-100 uppercase tracking-wider">
                {user.role}
              </span>
            </div>
          </div>
        )}
        {isCollapsed && user && (
          <div className="flex justify-center mt-2">
            <div
              title={`${user.full_name} (${user.role})`}
              className="w-8 h-8 rounded-full bg-[#3478F6] flex items-center justify-center text-white text-xs font-bold cursor-default"
            >
              {user.full_name?.charAt(0).toUpperCase()}
            </div>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className="fixed top-4 left-4 z-[60] md:hidden bg-[#101B32] text-white p-2 rounded-lg shadow-md"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Open menu"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Desktop sidebar */}
      <div className="hidden md:block">
        {sidebarContent}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="md:hidden fixed left-0 top-0 z-50 h-full" style={{ width: 240 }}>
            {sidebarContent}
          </div>
        </>
      )}
    </>
  );
}
