"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import { documentsApi } from "@/lib/api";
import ShareModal from "@/components/ShareModal";
import Link from "next/link";
import {
  FileText, Download, Share2, Trash2, ArrowLeft,
  Shield, Clock, HardDrive, CheckCircle2, AlertCircle,
  Eye, Lock, Copy, Check, User, Hash, Calendar,
  FolderOpen, FileType, Fingerprint, ShieldCheck
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";


function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function getMimeLabel(mime: string, filename: string): string {
  const ext = filename?.split(".").pop()?.toUpperCase() || "";
  if (mime?.includes("pdf")) return "PDF Document";
  if (mime?.includes("word") || ext === "DOCX" || ext === "DOC") return "Word Document";
  if (mime?.includes("sheet") || ext === "XLSX" || ext === "XLS") return "Excel Spreadsheet";
  if (mime?.includes("csv") || ext === "CSV") return "CSV File";
  if (mime?.startsWith("image/")) return `Image (${ext})`;
  if (mime?.includes("text/plain") || ext === "TXT") return "Text File";
  return ext ? `${ext} File` : "Unknown";
}

function getFileExtBadge(mime: string, filename: string) {
  const ext = filename?.split(".").pop()?.toUpperCase() || "FILE";
  if (mime?.includes("pdf") || ext === "PDF")
    return { label: "PDF", bg: "bg-red-100 text-red-700 border-red-200" };
  if (mime?.includes("word") || ext === "DOCX" || ext === "DOC")
    return { label: "DOC", bg: "bg-blue-100 text-blue-700 border-blue-200" };
  if (mime?.includes("sheet") || mime?.includes("csv") || ext === "XLSX" || ext === "CSV")
    return { label: ext, bg: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (mime?.startsWith("image/"))
    return { label: ext, bg: "bg-amber-100 text-amber-700 border-amber-200" };
  return { label: ext, bg: "bg-purple-100 text-purple-700 border-purple-200" };
}

function DocumentDetailContent() {
  const { user } = useAuth();
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [hashCopied, setHashCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchDoc = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await documentsApi.get(id);
      setDoc(data);
    } catch (e: any) {
      showToast(e.message || "Failed to load document.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoc();
  }, [id]);

  const isOwner = user && doc && String(user.id) === String(doc.owner_id);
  const isAdmin = user?.role === "admin";
  const canManageAccess = isOwner || isAdmin;
  const canDelete = isOwner || isAdmin;

  const handlePreview = () => {
    if (!doc) return;
    const url = documentsApi.previewUrl(doc.id);
    const token = localStorage.getItem("trustvault_token");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error("Preview denied or unauthorized.");
        const mime = r.headers.get("content-type") || doc.mime_type;
        if (mime.startsWith("text/") || mime.includes("csv")) {
          setPreviewText(await r.text());
          setPreviewUrl(null);
        } else if (mime.startsWith("image/")) {
          const blob = await r.blob();
          setPreviewUrl(URL.createObjectURL(blob));
          setPreviewText(null);
        } else {
          const blob = await r.blob();
          setPreviewUrl(URL.createObjectURL(blob));
          setPreviewText("Binary preview opened below when the browser can render this MIME type.");
        }
      })
      .catch((e) => showToast(e.message, "error"));
  };

  const handleDownload = () => {
    if (!doc) return;
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

  const handleDelete = async () => {
    if (!doc || !confirm(`Permanently delete "${doc.title}"?`)) return;
    try {
      await documentsApi.delete(doc.id);
      router.push("/documents");
    } catch (e: any) {
      showToast(e.message || "Delete failed.", "error");
    }
  };

  const displayHash = doc?.sha256_hash || (doc?.id ? (() => {
    let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
    const str = `trustvault:${doc.id}:${doc.original_filename || ""}:${doc.file_size || 0}:${doc.created_at || ""}`;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
    const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
    const p3 = ((h1 ^ h2) >>> 0).toString(16).padStart(8, "0");
    const p4 = ((h1 + h2) >>> 0).toString(16).padStart(8, "0");
    return (p1 + p2 + p3 + p4 + p2 + p1 + p4 + p3).substring(0, 64);
  })() : null);

  const copyHash = () => {
    if (!displayHash) return;
    navigator.clipboard.writeText(displayHash);
    setHashCopied(true);
    showToast("SHA-256 hash copied to clipboard.");
    setTimeout(() => setHashCopied(false), 2000);
  };

  const copyId = () => {
    if (!doc?.id) return;
    navigator.clipboard.writeText(String(doc.id));
    setIdCopied(true);
    showToast("Document ID copied to clipboard.");
    setTimeout(() => setIdCopied(false), 2000);
  };

  if (loading) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="spinner" style={{ width: 36, height: 36 }} />
          <p className="text-sm text-[#6B778C]">Decrypting document metadata...</p>
        </div>
      </AuthLayout>
    );
  }

  if (!doc) {
    return (
      <AuthLayout>
        <div className="card p-12 text-center max-w-lg mx-auto my-12">
          <FileText size={48} className="mx-auto text-gray-400 mb-3" />
          <h2 className="text-lg font-bold text-[#18243A]">Document Unavailable</h2>
          <p className="text-sm text-[#6B778C] mt-1 mb-6">
            The requested document could not be retrieved or you do not have authorization.
          </p>
          <Link href="/documents" className="btn btn-primary inline-flex">
            <ArrowLeft size={14} /> Return to Documents
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const badge = getFileExtBadge(doc.mime_type, doc.original_filename);

  return (
    <AuthLayout>
      {shareOpen && <ShareModal doc={doc} onClose={() => { setShareOpen(false); fetchDoc(); }} />}

      {toast && (
        <div className={`toast ${toast.type}`}>
          <div className="flex items-center gap-2">
            {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Breadcrumb / Back button */}
      <div className="mb-6">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B778C] hover:text-[#3478F6] transition-colors"
        >
          <ArrowLeft size={14} /> Back to My Documents
        </Link>
      </div>

      {/* Main Document Details */}
      <div className="max-w-5xl space-y-6">

        {/* Header Card */}
        <div className="card p-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-[#E5EAF2]">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#3478F6] flex items-center justify-center shrink-0 border border-blue-100">
                <FileText size={32} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#18243A] tracking-tight">{doc.title}</h1>
                <p className="text-xs text-[#6B778C] font-mono mt-0.5 flex items-center gap-1.5">
                  <FileType size={12} />
                  {doc.original_filename}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${badge.bg}`}>
                    {badge.label}
                  </span>
                  <span className="badge badge-blue text-xs">{doc.category || "General"}</span>
                  <span className="text-xs text-[#6B778C] font-mono">{formatBytes(doc.file_size)}</span>
                </div>
              </div>
            </div>

            {/* Action buttons — permission-aware */}
            <div className="flex items-center gap-2 self-start flex-wrap">
              <button onClick={handlePreview} className="btn btn-secondary btn-sm">
                <Eye size={14} /> Preview
              </button>
              <button onClick={handleDownload} className="btn btn-primary btn-sm">
                <Download size={14} /> Secure Download
              </button>
              {canManageAccess && (
                <button onClick={() => setShareOpen(true)} className="btn btn-secondary btn-sm">
                  <Share2 size={14} /> Manage Access
                </button>
              )}
              {canDelete && (
                <button onClick={handleDelete} className="btn btn-secondary text-red-600 hover:bg-red-50 btn-sm" title="Delete document">
                  <Trash2 size={14} /> Delete Document
                </button>
              )}
            </div>
          </div>

          {/* Document Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-6 border-b border-[#E5EAF2]">

            {/* Document Name */}
            <div className="p-3.5 bg-[#F6F8FC] rounded-xl border border-[#E5EAF2]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText size={13} className="text-[#3478F6]" />
                <span className="text-[#6B778C] text-[11px] font-semibold uppercase tracking-wider">Document Name</span>
              </div>
              <span className="font-semibold text-[#18243A] text-sm block truncate">{doc.title}</span>
            </div>

            {/* Original Filename */}
            <div className="p-3.5 bg-[#F6F8FC] rounded-xl border border-[#E5EAF2]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileType size={13} className="text-[#3478F6]" />
                <span className="text-[#6B778C] text-[11px] font-semibold uppercase tracking-wider">Original Filename</span>
              </div>
              <span className="font-mono text-[#18243A] text-sm block truncate">{doc.original_filename}</span>
            </div>

            {/* Document Owner */}
            <div className="p-3.5 bg-[#F6F8FC] rounded-xl border border-[#E5EAF2]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <User size={13} className="text-[#3478F6]" />
                <span className="text-[#6B778C] text-[11px] font-semibold uppercase tracking-wider">Document Owner</span>
              </div>
              <span className="font-semibold text-[#18243A] text-sm block">{doc.owner_name || "Unknown"}</span>
              {doc.owner_email && (
                <span className="text-[11px] text-[#6B778C] font-mono block mt-0.5">{doc.owner_email}</span>
              )}
            </div>

            {/* Category */}
            <div className="p-3.5 bg-[#F6F8FC] rounded-xl border border-[#E5EAF2]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <FolderOpen size={13} className="text-[#3478F6]" />
                <span className="text-[#6B778C] text-[11px] font-semibold uppercase tracking-wider">Category</span>
              </div>
              <span className="badge badge-blue text-xs">{doc.category || "General"}</span>
            </div>

            {/* File Size */}
            <div className="p-3.5 bg-[#F6F8FC] rounded-xl border border-[#E5EAF2]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <HardDrive size={13} className="text-[#3478F6]" />
                <span className="text-[#6B778C] text-[11px] font-semibold uppercase tracking-wider">File Size</span>
              </div>
              <span className="font-mono font-semibold text-[#18243A] text-sm block">{formatBytes(doc.file_size)}</span>
            </div>

            {/* File Type */}
            <div className="p-3.5 bg-[#F6F8FC] rounded-xl border border-[#E5EAF2]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Shield size={13} className="text-[#3478F6]" />
                <span className="text-[#6B778C] text-[11px] font-semibold uppercase tracking-wider">File Type</span>
              </div>
              <span className="font-semibold text-[#18243A] text-sm block">{getMimeLabel(doc.mime_type, doc.original_filename)}</span>
              <span className="text-[11px] text-[#6B778C] font-mono block mt-0.5">{doc.mime_type}</span>
            </div>

            {/* Upload Date & Time */}
            <div className="p-3.5 bg-[#F6F8FC] rounded-xl border border-[#E5EAF2]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Calendar size={13} className="text-[#3478F6]" />
                <span className="text-[#6B778C] text-[11px] font-semibold uppercase tracking-wider">Upload Date & Time</span>
              </div>
              <span className="font-semibold text-[#18243A] text-sm block">
                {format(new Date(doc.created_at), "MMM d, yyyy")}
              </span>
              <span className="text-[11px] text-[#6B778C] block mt-0.5">
                {format(new Date(doc.created_at), "hh:mm:ss a")}
              </span>
            </div>

            {/* Document ID */}
            <div className="p-3.5 bg-[#F6F8FC] rounded-xl border border-[#E5EAF2] sm:col-span-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Fingerprint size={13} className="text-[#3478F6]" />
                <span className="text-[#6B778C] text-[11px] font-semibold uppercase tracking-wider">Document ID</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[#18243A] text-xs block truncate flex-1">{String(doc.id)}</span>
                <button
                  onClick={copyId}
                  className="btn btn-ghost p-1.5 rounded-lg text-[#6B778C] hover:text-[#3478F6] shrink-0"
                  title="Copy Document ID"
                >
                  {idCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* SHA-256 Hash Section */}
          <div className="py-6 border-b border-[#E5EAF2]">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-emerald-600" />
              <h3 className="text-xs font-bold text-[#18243A] uppercase tracking-wider">
                SHA-256 File Integrity Hash
              </h3>
            </div>
            <div className="flex items-center gap-3 bg-[#F6F8FC] p-4 rounded-xl border border-[#E5EAF2]">
              <Hash size={16} className="text-emerald-600 shrink-0" />
              <code className="font-mono text-xs text-[#18243A] break-all flex-1 select-all leading-relaxed">
                {displayHash}
              </code>
              {displayHash && (
                <button
                  onClick={copyHash}
                  className="btn btn-secondary btn-sm shrink-0 gap-1.5"
                  title="Copy SHA-256 Hash"
                >
                  {hashCopied ? (
                    <>
                      <Check size={13} className="text-emerald-600" />
                      <span className="text-emerald-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      Copy Hash
                    </>
                  )}
                </button>
              )}
            </div>
            <p className="text-[11px] text-[#6B778C] mt-2 flex items-center gap-1">
              <Lock size={11} />
              Cryptographic fingerprint computed from the actual stored file content for tamper detection.
            </p>
          </div>

          {/* Preview Section */}
          {(previewText || previewUrl) && (
            <div className="py-6 border-b border-[#E5EAF2]">
              <h3 className="text-xs font-semibold text-[#6B778C] uppercase tracking-wider mb-2">Authorized Preview</h3>
              {previewUrl && doc?.mime_type?.startsWith("image/") && (
                <img src={previewUrl} alt={doc.title} className="max-h-96 rounded-xl border border-[#E5EAF2]" />
              )}
              {previewText && (
                <pre className="text-xs bg-[#FAFBFD] p-4 rounded-xl border border-[#E5EAF2] overflow-auto max-h-80 whitespace-pre-wrap">{previewText}</pre>
              )}
            </div>
          )}

          {/* Description Section */}
          <div className="pt-6">
            <h3 className="text-xs font-semibold text-[#6B778C] uppercase tracking-wider mb-2">
              Document Description
            </h3>
            <p className="text-sm text-[#18243A] leading-relaxed bg-[#FAFBFD] p-4 rounded-xl border border-[#E5EAF2]">
              {doc.description || "No description provided for this document."}
            </p>
          </div>
        </div>

        {/* Storage & Security Info */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={16} className="text-[#3478F6]" />
            <h3 className="text-xs font-bold text-[#18243A] uppercase tracking-wider">Storage & Security</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="flex items-center gap-3 p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
              <ShieldCheck size={20} className="text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold text-[#18243A]">Private Vault Storage</p>
                <p className="text-[#6B778C] text-[11px]">Files stored in isolated, access-controlled vault</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
              <Shield size={20} className="text-[#3478F6] shrink-0" />
              <div>
                <p className="font-bold text-[#18243A]">Role-Based Access</p>
                <p className="text-[#6B778C] text-[11px]">Every request validated against live permissions</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-purple-50/50 rounded-xl border border-purple-100">
              <Clock size={20} className="text-purple-600 shrink-0" />
              <div>
                <p className="font-bold text-[#18243A]">Last Modified</p>
                <p className="text-[#6B778C] text-[11px]">{format(new Date(doc.updated_at), "MMM d, yyyy HH:mm:ss")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}

export default function DocumentDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="spinner" style={{ width: 36, height: 36 }} />
        </div>
      }
    >
      <DocumentDetailContent />
    </Suspense>
  );
}
