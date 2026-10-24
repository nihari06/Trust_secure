"use client";
import React, { useState, useEffect, useTransition } from "react";
import AuthLayout from "@/components/AuthLayout";
import Link from "next/link";
import { documentsApi } from "@/lib/api";
import {
  Share2, Search, Download, Eye, FileText,
  Clock, Shield, Edit3, X, CheckCircle2, AlertCircle, User
} from "lucide-react";
import { format } from "date-fns";

const CATEGORIES = ["All", "Finance", "HR", "Report", "Contract", "Legal", "Technical", "Other"];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getFileIcon(mime: string, filename: string) {
  const ext = filename?.split(".").pop()?.toLowerCase() || "";
  if (mime.includes("pdf") || ext === "pdf") {
    return <span className="w-9 h-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs uppercase shrink-0">PDF</span>;
  }
  if (mime.includes("word") || ext === "docx" || ext === "doc") {
    return <span className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs uppercase shrink-0">DOC</span>;
  }
  if (mime.includes("csv") || mime.includes("excel") || ext === "csv" || ext === "xlsx") {
    return <span className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs uppercase shrink-0">XLS</span>;
  }
  return <span className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><FileText size={18} /></span>;
}

export default function SharedDocumentsPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [category, setCategory] = useState("All");
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const [editDoc, setEditDoc] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    try {
      setLoading(true);
      const data = await documentsApi.shared({
        search: search || undefined,
        category: category !== "All" ? category : undefined,
        owner: ownerFilter || undefined,
      });
      setDocs(data || []);
    } catch (e: any) {
      showToast(e.message || "Failed to load shared documents.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDownload = (doc: any) => {
    const url = documentsApi.downloadUrl(doc.id);
    const token = localStorage.getItem("trustvault_token");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error("Download denied or expired.");
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

  const openEdit = (doc: any) => {
    setEditDoc(doc);
    setEditTitle(doc.title);
    setEditDesc(doc.description || "");
    setEditCategory(doc.category || "Other");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDoc) return;
    try {
      await documentsApi.update(editDoc.id, {
        title: editTitle,
        description: editDesc,
        category: editCategory,
      });
      showToast("Document updated successfully.");
      setEditDoc(null);
      load();
    } catch (err: any) {
      showToast(err.message || "Edit failed. You may only have viewer rights.", "error");
    }
  };

  const filteredDocs = docs.filter((d) => {
    const matchesSearch =
      !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.owner_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.original_filename.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "All" || d.category === category;
    return matchesSearch && matchesCategory;
  });

  const editorCount = docs.filter((d) => d.permission_level === "editor").length;
  const viewerCount = docs.filter((d) => d.permission_level === "viewer").length;

  return (
    <AuthLayout>
      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          <div className="flex items-center gap-2">
            {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <div className="dialog-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="dialog" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAF2] mb-4">
              <div className="flex items-center gap-3">
                {getFileIcon(previewDoc.mime_type, previewDoc.original_filename)}
                <div>
                  <h3 className="font-bold text-[#18243A] text-base leading-tight">{previewDoc.title}</h3>
                  <p className="text-xs text-[#6B778C]">{previewDoc.original_filename}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="text-[#6B778C] hover:text-[#18243A] p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 bg-[#F6F8FC] p-3 rounded-lg text-xs">
                <div>
                  <span className="text-[#6B778C] block">Owner:</span>
                  <span className="font-semibold text-[#18243A]">{previewDoc.owner_name} ({previewDoc.owner_email})</span>
                </div>
                <div>
                  <span className="text-[#6B778C] block">Permission:</span>
                  <span className={`inline-block font-semibold px-2 py-0.5 rounded text-[11px] ${
                    previewDoc.permission_level === "editor"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-blue-100 text-blue-700"
                  }`}>
                    {previewDoc.permission_level.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-[#6B778C] block">File Size:</span>
                  <span className="font-medium text-[#18243A]">{formatBytes(previewDoc.file_size)}</span>
                </div>
                <div>
                  <span className="text-[#6B778C] block">Shared On:</span>
                  <span className="font-medium text-[#18243A]">
                    {format(new Date(previewDoc.shared_at), "MMM d, yyyy")}
                  </span>
                </div>
              </div>

              {previewDoc.description && (
                <div>
                  <h4 className="text-xs font-semibold text-[#6B778C] uppercase mb-1">Description</h4>
                  <p className="text-xs text-[#18243A] bg-white border border-[#E5EAF2] p-2.5 rounded-lg leading-relaxed">
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

      {/* Edit Modal (Editor level only) */}
      {editDoc && (
        <div className="dialog-overlay" onClick={() => setEditDoc(null)}>
          <div className="dialog" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAF2] mb-4">
              <div className="flex items-center gap-2">
                <Edit3 size={18} className="text-[#3478F6]" />
                <h3 className="font-bold text-[#18243A] text-base">Edit Document Metadata</h3>
              </div>
              <button onClick={() => setEditDoc(null)} className="text-[#6B778C] hover:text-[#18243A]">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="label">Title</label>
                <input
                  className="input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label">Category</label>
                <select
                  className="input select"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                >
                  {CATEGORIES.filter((c) => c !== "All").map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  className="input"
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Optional document description..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E5EAF2]">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditDoc(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#3478F6] uppercase tracking-wider mb-1">
            <Share2 size={14} /> Shared Workspace
          </div>
          <h1 className="text-2xl font-bold text-[#18243A] tracking-tight">Shared with Me</h1>
          <p className="text-[#6B778C] text-sm mt-0.5">
            Documents and assets securely shared with your account across the organization.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-icon bg-blue-50 text-[#3478F6]">
            <Share2 size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-[#6B778C] uppercase">Total Shared</p>
            <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">{docs.length}</h3>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-emerald-50 text-emerald-600">
            <Edit3 size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-[#6B778C] uppercase">Editor Access</p>
            <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">{editorCount}</h3>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-purple-50 text-purple-600">
            <Shield size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-[#6B778C] uppercase">Viewer Access</p>
            <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">{viewerCount}</h3>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="card p-4 mb-6 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B778C] pointer-events-none" />
            <input
              className="input input-with-icon text-sm"
              placeholder="Search shared files by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative sm:w-64">
            <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B778C] pointer-events-none" />
            <input
              className="input input-with-icon text-sm"
              placeholder="Filter by owner name or email..."
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
            />
          </div>
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

      {/* Document Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <p className="text-xs text-[#6B778C]">Retrieving shared access list...</p>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="empty-state py-16">
            <Share2 size={48} className="mx-auto mb-3 opacity-30 text-[#3478F6]" />
            <h3 className="text-base font-semibold text-[#18243A]">No shared documents found</h3>
            <p className="text-sm text-[#6B778C] mt-1 max-w-sm mx-auto">
              {search || category !== "All"
                ? "No documents matched your current search filters."
                : "No files have been shared with your account yet. When colleagues grant you access, they will appear here."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Owner</th>
                  <th>Permission</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Shared Date</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[#F9FAFC] transition-colors">
                    <td>
                      <div className="flex items-center gap-3">
                        {getFileIcon(doc.mime_type, doc.original_filename)}
                        <div className="min-w-0">
                          <p className="font-semibold text-[#18243A] text-sm truncate max-w-[240px]">
                            {doc.title}
                          </p>
                          <p className="text-xs text-[#6B778C] truncate max-w-[200px]">
                            {doc.original_filename}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="text-sm">
                        <span className="font-medium text-[#18243A] block">{doc.owner_name}</span>
                        <span className="text-xs text-[#6B778C]">{doc.owner_email}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                        doc.permission_level === "editor"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}>
                        <Shield size={12} />
                        {doc.permission_level.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-gray">{doc.category || "General"}</span>
                    </td>
                    <td className="text-xs text-[#6B778C] font-mono">
                      {formatBytes(doc.file_size)}
                    </td>
                    <td className="text-xs text-[#6B778C]">
                      {format(new Date(doc.shared_at), "MMM d, yyyy")}
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

                        {doc.permission_level === "editor" && (
                          <button
                            onClick={() => openEdit(doc)}
                            className="btn btn-ghost p-1.5 rounded-lg hover:text-emerald-600"
                            title="Edit Document"
                          >
                            <Edit3 size={16} />
                          </button>
                        )}

                        <button
                          onClick={() => handleDownload(doc)}
                          className="btn btn-ghost p-1.5 rounded-lg hover:text-[#3478F6]"
                          title="Download"
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
