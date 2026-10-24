"use client";
import React, { useEffect, useState, useCallback } from "react";
import AuthLayout from "@/components/AuthLayout";
import { documentsApi } from "@/lib/api";
import {
  FileText, Search, Upload, Trash2, Share2, Download,
  Eye, Filter, Plus, Shield, CheckCircle2, AlertCircle, X,
  Clock, HardDrive, LayoutGrid, List
} from "lucide-react";
import Link from "next/link";
import UploadModal from "@/components/UploadModal";
import ShareModal from "@/components/ShareModal";
import { format } from "date-fns";

const CATEGORIES = ["All", "Finance", "HR", "Report", "Contract", "Legal", "Technical", "Other"];

function formatBytes(b: number) {
  if (!b) return "0 B";
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileBadge(mime: string, filename: string) {
  const ext = filename?.split(".").pop()?.toUpperCase() || "";
  if (mime?.includes("pdf") || ext === "PDF") {
    return { label: "PDF", bg: "bg-red-50 text-red-700 border-red-200" };
  }
  if (mime?.includes("word") || ext === "DOCX" || ext === "DOC") {
    return { label: "DOC", bg: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  if (mime?.includes("sheet") || mime?.includes("csv") || ext === "XLSX" || ext === "CSV") {
    return { label: ext || "XLS", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  return { label: ext || "FILE", bg: "bg-purple-50 text-purple-700 border-purple-200" };
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [category, setCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [showUpload, setShowUpload] = useState(false);
  const [shareDoc, setShareDoc] = useState<any | null>(null);
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await documentsApi.list({
        search: search || undefined,
        category: category !== "All" ? category : undefined,
        from_date: fromDate || undefined,
        to_date: toDate ? `${toDate}T23:59:59` : undefined,
      });
      setDocs(data || []);
    } catch {
      setDocs([]);
    }
    setLoading(false);
  }, [search, category, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteDoc) return;
    setDeleting(true);
    try {
      await documentsApi.delete(deleteDoc.id);
      setDeleteDoc(null);
      showToast("Document deleted successfully.");
      load();
    } catch (e: any) {
      showToast(e.message || "Delete failed.", "error");
    }
    setDeleting(false);
  };

  const handleDownload = (doc: any) => {
    const url = documentsApi.downloadUrl(doc.id);
    const token = localStorage.getItem("trustvault_token");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error("Download denied.");
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

  const totalBytes = docs.reduce((acc, d) => acc + (d.file_size || 0), 0);

  return (
    <AuthLayout>
      {showUpload && <UploadModal onClose={() => { setShowUpload(false); load(); }} />}
      {shareDoc && <ShareModal doc={shareDoc} onClose={() => { setShareDoc(null); load(); }} />}

      {/* Delete confirmation modal */}
      {deleteDoc && (
        <div className="dialog-overlay" onClick={() => setDeleteDoc(null)}>
          <div className="dialog" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[#18243A] mb-2">Delete Document</h2>
            <p className="text-[#6B778C] text-sm mb-6">
              Are you sure you want to delete <strong>{deleteDoc.title}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button className="btn btn-secondary btn-sm" onClick={() => setDeleteDoc(null)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Trash2 size={14} />}
                Delete Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <div className="dialog-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="dialog" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAF2] mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#3478F6] flex items-center justify-center font-bold text-xs uppercase shrink-0">
                  {getFileBadge(previewDoc.mime_type, previewDoc.original_filename).label}
                </div>
                <div>
                  <h3 className="font-bold text-[#18243A] text-base leading-tight">{previewDoc.title}</h3>
                  <p className="text-xs text-[#6B778C]">{previewDoc.original_filename}</p>
                </div>
              </div>
              <button onClick={() => setPreviewDoc(null)} className="text-[#6B778C] hover:text-[#18243A]">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-[#F6F8FC] p-3 rounded-xl border border-[#E5EAF2]">
                <div>
                  <span className="text-[#6B778C] block uppercase text-[10px] font-semibold">Category</span>
                  <span className="font-bold text-[#18243A] text-xs">{previewDoc.category || "General"}</span>
                </div>
                <div>
                  <span className="text-[#6B778C] block uppercase text-[10px] font-semibold">File Size</span>
                  <span className="font-bold text-[#18243A] text-xs font-mono">{formatBytes(previewDoc.file_size)}</span>
                </div>
                <div>
                  <span className="text-[#6B778C] block uppercase text-[10px] font-semibold">Uploaded</span>
                  <span className="font-medium text-[#18243A]">{format(new Date(previewDoc.created_at), "MMM d, yyyy HH:mm")}</span>
                </div>
                <div>
                  <span className="text-[#6B778C] block uppercase text-[10px] font-semibold">Permissions</span>
                  <span className="font-medium text-[#3478F6]">{previewDoc.permissions?.length || 0} Active Grants</span>
                </div>
              </div>

              {previewDoc.description && (
                <div>
                  <span className="font-semibold text-[#18243A] block mb-1">Description</span>
                  <p className="text-xs text-[#475569] bg-white border border-[#E5EAF2] p-3 rounded-lg leading-relaxed">
                    {previewDoc.description}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end mt-6 pt-3 border-t border-[#E5EAF2]">
              <button className="btn btn-secondary btn-sm" onClick={() => setPreviewDoc(null)}>
                Close
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  handleDownload(previewDoc);
                  setPreviewDoc(null);
                }}
              >
                <Download size={14} /> Download File
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.type}`}>
          <div className="flex items-center gap-2">
            {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#3478F6] uppercase tracking-wider mb-1">
            <FileText size={14} /> Document Storage
          </div>
          <h1 className="text-2xl font-bold text-[#18243A] tracking-tight">My Documents</h1>
          <p className="text-[#6B778C] text-sm mt-0.5">
            Encrypted files owned by your account with fine-grained access delegation.
          </p>
        </div>

        <button
          onClick={() => setShowUpload(true)}
          className="btn btn-primary self-start md:self-auto shadow-sm"
          id="my-docs-upload-btn"
        >
          <Upload size={16} /> Upload Document
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-icon bg-blue-50 text-[#3478F6]">
            <FileText size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-[#6B778C] uppercase">Total Files</p>
            <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">{docs.length}</h3>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-emerald-50 text-emerald-600">
            <HardDrive size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-[#6B778C] uppercase">Storage Used</p>
            <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">{formatBytes(totalBytes)}</h3>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-purple-50 text-purple-600">
            <Shield size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-[#6B778C] uppercase">Storage</p>
            <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">Private vault</h3>
          </div>
        </div>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="card p-4 mb-6 space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B778C] pointer-events-none" />
            <input
              className="input input-with-icon"
              style={{ paddingLeft: "40px" }}
              placeholder="Search documents by title or filename..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1 border border-[#E5EAF2] rounded-lg p-1 bg-[#FAFBFD] shrink-0 self-end sm:self-auto">
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-white text-[#3478F6] shadow-xs" : "text-[#6B778C]"}`}
              title="Table View"
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-white text-[#3478F6] shadow-xs" : "text-[#6B778C]"}`}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="text-[#6B778C] font-medium">From
            <input type="date" className="input ml-2 w-auto" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label className="text-[#6B778C] font-medium">To
            <input type="date" className="input ml-2 w-auto" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
        </div>
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`pill-filter ${category === c ? "active" : ""}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content: Table or Grid */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <p className="text-xs text-[#6B778C]">Retrieving vault documents...</p>
          </div>
        ) : docs.length === 0 ? (
          <div className="empty-state py-16">
            <FileText size={48} className="mx-auto mb-3 opacity-30 text-[#3478F6]" />
            <h3 className="text-base font-semibold text-[#18243A]">No documents found</h3>
            <p className="text-sm text-[#6B778C] mt-1 max-w-sm mx-auto">
              {search || category !== "All"
                ? "No documents match your current filter criteria."
                : "Your personal secure vault is empty. Upload your first document to get started."}
            </p>
            {!search && category === "All" && (
              <button className="btn btn-primary btn-sm mt-4" onClick={() => setShowUpload(true)}>
                <Upload size={14} /> Upload First File
              </button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {docs.map((doc) => {
              const badge = getFileBadge(doc.mime_type, doc.original_filename);

              return (
                <div key={doc.id} className="card card-hover p-4 border border-[#E5EAF2] rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${badge.bg}`}>
                        {badge.label}
                      </span>
                      <span className="badge badge-gray text-[11px]">{doc.category || "General"}</span>
                    </div>

                    <Link
                      href={`/documents/${doc.id}`}
                      className="font-bold text-[#18243A] text-sm hover:text-[#3478F6] transition-colors line-clamp-1"
                    >
                      {doc.title}
                    </Link>
                    <p className="text-xs text-[#6B778C] truncate mt-0.5">{doc.original_filename}</p>
                    {doc.description && (
                      <p className="text-xs text-[#6B778C] line-clamp-2 mt-2 leading-relaxed">
                        {doc.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-4 mt-4 border-t border-[#E5EAF2] flex items-center justify-between text-xs text-[#6B778C]">
                    <span className="font-mono">{formatBytes(doc.file_size)}</span>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="btn btn-ghost p-1.5 rounded-lg"
                        title="View Document"
                      >
                        <Eye size={15} />
                      </Link>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="btn btn-ghost p-1.5 rounded-lg text-[#3478F6]"
                        title="Download"
                      >
                        <Download size={15} />
                      </button>
                      <button
                        onClick={() => setShareDoc(doc)}
                        className="btn btn-ghost p-1.5 rounded-lg text-emerald-600"
                        title="Share"
                      >
                        <Share2 size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteDoc(doc)}
                        className="btn btn-ghost p-1.5 rounded-lg text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Category</th>
                  <th>File Size</th>
                  <th>Uploaded On</th>
                  <th>Permissions</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => {
                  const badge = getFileBadge(doc.mime_type, doc.original_filename);

                  return (
                    <tr key={doc.id} className="hover:bg-[#F9FAFC] transition-colors">
                      <td>
                        <div className="flex items-center gap-3">
                          <span className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs uppercase shrink-0 border ${badge.bg}`}>
                            {badge.label}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/documents/${doc.id}`}
                              className="font-semibold text-[#18243A] text-sm hover:text-[#3478F6] transition-colors truncate block max-w-[260px]"
                            >
                              {doc.title}
                            </Link>
                            <p className="text-xs text-[#6B778C] truncate max-w-[220px]">
                              {doc.original_filename}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-blue">{doc.category || "General"}</span>
                      </td>
                      <td className="text-xs text-[#6B778C] font-mono">
                        {formatBytes(doc.file_size)}
                      </td>
                      <td className="text-xs text-[#6B778C]">
                        {format(new Date(doc.created_at), "MMM d, yyyy")}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setShareDoc(doc)}
                          className="text-xs text-[#6B778C] hover:text-[#3478F6] flex items-center gap-1 font-medium transition-colors"
                          title="Manage permissions"
                        >
                          <Shield size={12} className="text-[#3478F6]" />
                          <span>{doc.permissions_count ?? (doc.permissions?.length || 0)} granted</span>
                        </button>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/documents/${doc.id}`}
                            className="btn btn-ghost p-1.5 rounded-lg hover:text-[#3478F6]"
                            title="View Document"
                          >
                            <Eye size={16} />
                          </Link>
                          <button
                            onClick={() => handleDownload(doc)}
                            className="btn btn-ghost p-1.5 rounded-lg hover:text-[#3478F6]"
                            title="Download"
                          >
                            <Download size={16} />
                          </button>
                          <button
                            onClick={() => setShareDoc(doc)}
                            className="btn btn-ghost p-1.5 rounded-lg hover:text-emerald-600"
                            title="Share Permissions"
                          >
                            <Share2 size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteDoc(doc)}
                            className="btn btn-ghost p-1.5 rounded-lg hover:text-red-600"
                            title="Delete Document"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
