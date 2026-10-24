"use client";
import React, { useEffect, useState } from "react";
import AuthLayout from "@/components/AuthLayout";
import AccessDenied from "@/components/AccessDenied";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi, auditApi } from "@/lib/api";
import {
  FileText, Share2, Shield, Activity, Upload,
  Clock, CheckCircle2, AlertTriangle, ArrowRight,
  ShieldCheck, Lock, Users, ExternalLink, ChevronRight
} from "lucide-react";
import Link from "next/link";
import UploadModal from "@/components/UploadModal";
import { format } from "date-fns";

const OUTCOME_COLORS: Record<string, string> = {
  success: "text-emerald-600 bg-emerald-50 border-emerald-200",
  allowed: "text-emerald-600 bg-emerald-50 border-emerald-200",
  failure: "text-red-600 bg-red-50 border-red-200",
  denied: "text-red-600 bg-red-50 border-red-200",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [stats, setStats] = useState<any>(null);
  const [recentDocs, setRecentDocs] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [greeting, setGreeting] = useState("Welcome back");
  const [chainValid, setChainValid] = useState<boolean | null>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
  }, []);

  const load = async () => {
    try {
      const [s, d, a] = await Promise.all([
        dashboardApi.stats(),
        dashboardApi.recentDocuments(6),
        dashboardApi.recentActivity(8),
      ]);
      setStats(s);
      setRecentDocs(d || []);
      setRecentActivity(a || []);

      if (isAdmin) {
        auditApi.verify().then((res) => {
          setChainValid(res.valid);
        }).catch(() => {});
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [isAdmin]);

  const STAT_CARDS = [
    { label: "My Documents", value: stats?.my_documents ?? "0", icon: FileText, color: "#3478F6", bg: "#EBF2FF", href: "/documents" },
    { label: "Shared Files", value: stats?.shared_with_me ?? "0", icon: Share2, color: "#16866B", bg: "#ECFDF5", href: "/shared" },
    { label: "Active Permissions", value: stats?.active_permissions ?? "0", icon: Shield, color: "#A66C12", bg: "#FFFBEB", href: "/permissions" },
    { label: "Security Events", value: stats?.recent_activities ?? "0", icon: Activity, color: "#7C3AED", bg: "#F5F3FF", href: "/audit" },
  ];
  if (user && user.role !== "admin" && user.role !== "owner") {
    return (
      <AuthLayout>
        <AccessDenied
          title="Access Denied"
          message="You don't have permission to access this resource. If you believe this is a mistake, contact the document owner or administrator."
          backHref="/documents"
          backLabel="Back to Documents"
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {showUpload && <UploadModal onClose={() => { setShowUpload(false); load(); }} />}

      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#3478F6] uppercase tracking-wider mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            TrustVault Enterprise Platform
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#18243A] tracking-tight">
            {greeting}, {user?.full_name?.split(" ")[0]}!
          </h1>
          <p className="text-[#6B778C] text-sm mt-0.5">
            Real-time security telemetry, encrypted vault documents, and access delegation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/audit" className="btn btn-secondary btn-sm text-xs">
            <Activity size={14} /> Audit Trail
          </Link>
          <button
            onClick={() => setShowUpload(true)}
            className="btn btn-primary btn-sm text-xs shadow-sm"
            id="upload-document-btn"
          >
            <Upload size={14} /> Upload File
          </button>
        </div>
      </div>

      {/* Stat Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STAT_CARDS.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="stat-card card-hover group"
          >
            <div className="stat-icon" style={{ background: card.bg }}>
              <card.icon size={22} style={{ color: card.color }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[#6B778C] text-xs font-semibold uppercase tracking-wider">{card.label}</p>
              <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">
                {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : card.value}
              </h3>
            </div>
            <ChevronRight size={16} className="text-[#9AA5B8] group-hover:text-[#3478F6] transition-colors" />
          </Link>
        ))}
      </div>

      {/* Security Health & Quick Actions Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card p-4 flex items-center gap-3 border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50/30 to-white">
          <ShieldCheck size={28} className="text-emerald-600 shrink-0" />
          <div>
            <h4 className="font-bold text-xs text-[#18243A]">Cryptographic Ledger Integrity</h4>
            <p className="text-[11px] text-[#6B778C]">
              {chainValid === true
                ? "Live SHA-256 chain verification passed for the current ledger."
                : chainValid === false
                ? "Live verification failed. Inspect the Audit Trail for hash mismatches."
                : isAdmin
                ? "Not verified in this session. Open Audit Trail and run Verify Hash Chain."
                : "Hash-chain verification is an administrator action on the Audit Trail."}
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3 border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50/30 to-white">
          <Lock size={28} className="text-[#3478F6] shrink-0" />
          <div>
            <h4 className="font-bold text-xs text-[#18243A]">End-to-End Vault Storage</h4>
            <p className="text-[11px] text-[#6B778C]">Zero plaintext leaks with scoped MIME validation.</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3 border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50/30 to-white">
          <Shield size={28} className="text-purple-600 shrink-0" />
          <div>
            <h4 className="font-bold text-xs text-[#18243A]">Granular Access Policy</h4>
            <p className="text-[11px] text-[#6B778C]">Role-based privilege checks on every request.</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Documents & Activity Log */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Documents */}
        <div className="lg:col-span-2 card overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5EAF2]">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#3478F6]" />
                <h2 className="font-bold text-[#18243A] text-base">Recent Vault Documents</h2>
              </div>
              <Link href="/documents" className="text-xs font-semibold text-[#3478F6] hover:underline flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>

            {loading ? (
              <div className="flex justify-center py-16"><div className="spinner" /></div>
            ) : recentDocs.length === 0 ? (
              <div className="empty-state py-16">
                <FileText size={40} className="mx-auto text-gray-300 mb-2" />
                <p className="font-bold text-sm text-[#18243A]">No documents found</p>
                <p className="text-xs text-[#6B778C] mt-1">Upload a file to begin managing encrypted assets.</p>
                <button onClick={() => setShowUpload(true)} className="btn btn-primary btn-sm mt-4 text-xs">
                  <Upload size={13} /> Upload Document
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#E5EAF2]">
                {recentDocs.map((doc) => (
                  <div key={doc.id} className="p-4 hover:bg-[#FAFBFD] transition-colors flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#3478F6] flex items-center justify-center font-bold text-xs uppercase shrink-0">
                        {doc.original_filename?.split(".").pop()?.toUpperCase() || "FILE"}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/documents/${doc.id}`} className="font-semibold text-sm text-[#18243A] hover:text-[#3478F6] transition-colors truncate block">
                          {doc.title}
                        </Link>
                        <p className="text-xs text-[#6B778C] truncate">{doc.original_filename}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="badge badge-gray text-[11px]">{doc.category || "General"}</span>
                      <span className="text-xs text-[#6B778C]">
                        {format(new Date(doc.created_at), "MMM d")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-[#FAFBFD] border-t border-[#E5EAF2] flex items-center justify-between text-xs text-[#6B778C]">
            <span>Fast direct upload supporting PDF, DOCX, XLSX, CSV, and images</span>
            <button onClick={() => setShowUpload(true)} className="text-[#3478F6] font-semibold hover:underline">
              + Quick Add
            </button>
          </div>
        </div>

        {/* Real-time Activity Timeline */}
        <div className="card overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5EAF2]">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-purple-600" />
                <h2 className="font-bold text-[#18243A] text-base">Security Activity</h2>
              </div>
              <Link href="/audit" className="text-xs font-semibold text-[#3478F6] hover:underline flex items-center gap-1">
                Ledger <ArrowRight size={12} />
              </Link>
            </div>

            {loading ? (
              <div className="flex justify-center py-16"><div className="spinner" /></div>
            ) : recentActivity.length === 0 ? (
              <div className="empty-state py-16">
                <Activity size={40} className="mx-auto text-gray-300 mb-2" />
                <p className="font-bold text-sm text-[#18243A]">No recent activity</p>
                <p className="text-xs text-[#6B778C] mt-1">Actions taken across the vault will log here.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#E5EAF2]">
                {recentActivity.map((ev, i) => {
                  const outcomeStyle = OUTCOME_COLORS[ev.outcome] || "text-gray-600 bg-gray-50 border-gray-200";

                  return (
                    <div key={i} className="p-3.5 hover:bg-[#FAFBFD] transition-colors text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#18243A] truncate max-w-[170px]">
                          {ev.action}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${outcomeStyle}`}>
                          {ev.outcome.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[#6B778C] text-[11px]">
                        <span className="truncate max-w-[150px]">{ev.actor_email || "System"}</span>
                        <span>{format(new Date(ev.timestamp), "HH:mm:ss")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-3 bg-[#FAFBFD] border-t border-[#E5EAF2] text-center">
            <Link href="/audit" className="text-xs font-semibold text-[#3478F6] hover:underline">
              Inspect Full Chained Audit Trail →
            </Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
