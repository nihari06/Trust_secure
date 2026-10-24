"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import UploadModal from "@/components/UploadModal";
import { documentsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  FolderOpen, FileText, ArrowRight, Loader2, ShieldCheck,
  Scale, Users, DollarSign, Cpu, Folder, Laptop,
  GraduationCap, User as UserIcon, Upload, Plus, Download,
  Eye, CheckCircle2, AlertCircle, FileType
} from "lucide-react";
import { format } from "date-fns";

interface CategoryMeta {
  name: string;
  desc: string;
  icon: any;
  accent: string;
  iconBg: string;
  iconColor: string;
}

const CATEGORY_CARDS: CategoryMeta[] = [
  {
    name: "Finance",
    desc: "Invoices, salary slips and financial records.",
    icon: DollarSign,
    accent: "#10B981",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    name: "HR",
    desc: "Resumes, offer letters and employee records.",
    icon: Users,
    accent: "#8B5CF6",
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
  },
  {
    name: "Report",
    desc: "Business reports, performance reviews and analytics.",
    icon: FileText,
    accent: "#3B82F6",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  {
    name: "Contract",
    desc: "Vendor agreements, service contracts and terms.",
    icon: FileType,
    accent: "#F59E0B",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    name: "Legal",
    desc: "Contracts, agreements and regulatory compliance documents.",
    icon: Scale,
    accent: "#6366F1",
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
  },
  {
    name: "Technical",
    desc: "Software architecture, system documentation and code specs.",
    icon: Cpu,
    accent: "#06B6D4",
    iconBg: "bg-cyan-50",
    iconColor: "text-cyan-600",
  },
  {
    name: "Other",
    desc: "General documents, notes and archived files.",
    icon: Folder,
    accent: "#64748B",
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
  },
];

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

export default function CategoriesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [categoriesSummary, setCategoriesSummary] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>("Finance");
  const [categoryDocs, setCategoryDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>("Finance");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await documentsApi.categoriesSummary();
      const countMap: Record<string, number> = {};
      if (Array.isArray(data)) {
        data.forEach((item: any) => {
          countMap[item.category] = item.total_count || 0;
        });
      }
      setCategoriesSummary(countMap);
    } catch (err: any) {
      setError(err.message || "Failed to load categories.");
    } finally {
      setLoading(false);
    }
  };

  const selectCategory = async (cat: string) => {
    setSelectedCategory(cat);
    setDocsLoading(true);
    try {
      const [owned, shared] = await Promise.all([
        documentsApi.list({ category: cat }).catch(() => []),
        documentsApi.listShared({ category: cat }).catch(() => []),
      ]);

      const merged = [
        ...(Array.isArray(owned) ? owned.map((d: any) => ({ ...d, source: "owned" })) : []),
        ...(Array.isArray(shared) ? shared.map((d: any) => ({ ...d, source: "shared" })) : []),
      ];

      const seen = new Set();
      const unique = merged.filter((d) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });

      setCategoryDocs(unique);
    } catch (err: any) {
      setError(err.message || "Failed to load category documents.");
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
    selectCategory("Finance");
  }, []);

  const handleOpenUpload = (cat?: string) => {
    setUploadCategory(cat || selectedCategory || "Finance");
    setShowUpload(true);
  };

  const handleDownload = (doc: any) => {
    const url = documentsApi.downloadUrl(doc.id);
    const token = localStorage.getItem("trustvault_token");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error("Download denied or unauthorized.");
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = doc.original_filename;
        a.click();
        showToast(`Downloaded "${doc.original_filename}"`);
      })
      .catch((e) => showToast(e.message, "error"));
  };

  return (
    <AuthLayout>
      {showUpload && (
        <UploadModal
          initialCategory={uploadCategory}
          onClose={() => {
            setShowUpload(false);
            loadSummary();
            selectCategory(selectedCategory);
          }}
        />
      )}

      {toast && (
        <div className={`toast ${toast.type}`}>
          <div className="flex items-center gap-2">
            {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      <div className="space-y-6 max-w-6xl">
        {/* Header with Title & Upload CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#3478F6] uppercase tracking-wider mb-1">
              <FolderOpen size={14} /> Classification & Organization
            </div>
            <h1 className="text-2xl font-bold text-[#18243A] tracking-tight">Categories</h1>
            <p className="text-[#6B778C] text-sm mt-0.5">
              Securely organized document vault sections for corporate and personal files.
            </p>
          </div>

          <button
            onClick={() => handleOpenUpload(selectedCategory)}
            className="btn btn-primary self-start sm:self-auto gap-2"
          >
            <Upload size={16} />
            <span>Upload Document</span>
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Categories Grid — exact boxes matching demo */}
        {loading ? (
          <div className="card p-12 text-center text-[#6B778C] space-y-2">
            <Loader2 size={24} className="animate-spin mx-auto text-[#3478F6]" />
            <p className="text-xs">Loading categories…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CATEGORY_CARDS.map((card) => {
              const Icon = card.icon;
              const count = categoriesSummary[card.name] || 0;
              const isSelected = selectedCategory === card.name;

              return (
                <div
                  key={card.name}
                  className={`card p-5 relative overflow-hidden transition-all flex flex-col justify-between ${
                    isSelected
                      ? "ring-2 ring-[#3478F6] shadow-sm border-blue-200"
                      : "hover:border-[#CBD5E1] hover:shadow-sm"
                  }`}
                  style={{ background: "#FFFFFF" }}
                >
                  {/* Top Accent Strip */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: card.accent }}
                  />

                  <div>
                    {/* Top Row: Icon + Count Pill */}
                    <div className="flex items-start justify-between gap-3 mb-4 mt-1">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${card.iconBg} ${card.iconColor} border border-black/5`}>
                        <Icon size={22} />
                      </div>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
                        {count} document{count === 1 ? "" : "s"}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-bold text-[#18243A] tracking-tight">
                      {card.name}
                    </h3>

                    {/* Description */}
                    <p className="text-xs text-[#6B778C] mt-1.5 leading-relaxed min-h-[36px]">
                      {card.desc}
                    </p>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="pt-4 mt-4 border-t border-[#E5EAF2] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => selectCategory(card.name)}
                      className={`text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                        isSelected ? "text-[#3478F6] font-bold" : "text-[#18243A] hover:text-[#3478F6]"
                      }`}
                    >
                      <span>View Documents</span>
                      <ArrowRight size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenUpload(card.name)}
                      className="btn btn-ghost p-1.5 rounded-lg text-[#6B778C] hover:text-[#3478F6]"
                      title={`Upload to ${card.name}`}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Filtered Documents for selected category */}
        {selectedCategory && (
          <div className="card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5EAF2]">
              <div className="flex items-center gap-2">
                <FolderOpen size={18} className="text-[#3478F6]" />
                <h2 className="font-bold text-[#18243A] text-lg">
                  {selectedCategory} Documents
                </h2>
                <span className="badge badge-blue text-xs ml-1">
                  {categoryDocs.length} {categoryDocs.length === 1 ? "file" : "files"}
                </span>
              </div>

              <button
                onClick={() => handleOpenUpload(selectedCategory)}
                className="btn btn-secondary btn-sm gap-1.5 self-start sm:self-auto"
              >
                <Plus size={14} /> Upload to {selectedCategory}
              </button>
            </div>

            {docsLoading ? (
              <div className="py-12 text-center text-[#6B778C] space-y-2">
                <Loader2 size={24} className="animate-spin mx-auto text-[#3478F6]" />
                <p className="text-xs">Loading authorized documents…</p>
              </div>
            ) : categoryDocs.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto text-gray-400">
                  <FileText size={24} />
                </div>
                <h3 className="text-sm font-semibold text-[#18243A]">No documents in {selectedCategory}</h3>
                <p className="text-xs text-[#6B778C] max-w-sm mx-auto">
                  There are no documents uploaded or shared with you under the {selectedCategory} category yet.
                </p>
                <button
                  onClick={() => handleOpenUpload(selectedCategory)}
                  className="btn btn-primary btn-sm inline-flex gap-1.5"
                >
                  <Upload size={14} /> Upload First {selectedCategory} Document
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#E5EAF2]">
                {categoryDocs.map((doc) => (
                  <div key={doc.id} className="py-3.5 flex items-center justify-between gap-4 hover:bg-[#FAFBFD] px-2 rounded-lg transition-colors">
                    <div className="min-w-0 flex-1 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#3478F6] flex items-center justify-center shrink-0">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/documents/${doc.id}`}
                            className="font-semibold text-sm text-[#18243A] hover:text-[#3478F6] truncate"
                          >
                            {doc.title}
                          </Link>
                          {doc.source === "shared" ? (
                            <span className="badge badge-gray text-[10px]">Shared</span>
                          ) : (
                            <span className="badge badge-blue text-[10px]">Owned</span>
                          )}
                        </div>
                        <p className="text-xs text-[#64748B] mt-0.5 truncate font-mono">
                          {doc.original_filename} • {formatBytes(doc.file_size)} • {format(new Date(doc.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="btn btn-secondary btn-sm text-xs gap-1"
                        title="View Document Details"
                      >
                        <Eye size={14} />
                        <span className="hidden sm:inline">View Document</span>
                      </Link>

                      <button
                        onClick={() => handleDownload(doc)}
                        className="btn btn-ghost p-1.5 rounded-lg text-[#3478F6]"
                        title="Download"
                      >
                        <Download size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
