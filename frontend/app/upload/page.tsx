"use client";
import React, { useState, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import { documentsApi } from "@/lib/api";
import {
  Upload, ArrowLeft, Lock, FileText, CheckCircle2,
  AlertCircle, Loader2, ShieldCheck, FileCheck
} from "lucide-react";

const CATEGORIES = [
  "Finance",
  "HR",
  "Report",
  "Contract",
  "Legal",
  "Technical",
  "Other"
];

const MAX_MB = 10;
const ALLOWED_EXT = ["pdf", "txt", "docx", "xlsx", "csv", "png", "jpg", "jpeg"];

function UploadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialCategoryParam = searchParams.get("category");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Finance");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (initialCategoryParam && CATEGORIES.includes(initialCategoryParam)) {
      setCategory(initialCategoryParam);
    }
  }, [initialCategoryParam]);

  const validate = (f: File): string | null => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXT.includes(ext)) {
      return `File type .${ext || "unknown"} is not allowed. Supported formats: ${ALLOWED_EXT.join(", ").toUpperCase()}`;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      return `File size exceeds the ${MAX_MB} MB limit.`;
    }
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const err = validate(selected);
    if (err) {
      setError(err);
      setFile(null);
      return;
    }
    setError(null);
    setFile(selected);
    if (!title) {
      setTitle(selected.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }
    if (!title.trim()) {
      setError("Document title is required.");
      return;
    }

    setUploading(true);
    setError(null);
    const timer = setInterval(() => setProgress((p) => Math.min(p + 15, 88)), 120);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title.trim());
    fd.append("category", category);
    if (description.trim()) {
      fd.append("description", description.trim());
    }

    try {
      const res: any = await documentsApi.upload(fd);
      clearInterval(timer);
      setProgress(100);
      setSuccess(true);
      setTimeout(() => {
        if (res?.id) {
          router.push(`/documents/${res.id}`);
        } else {
          router.push("/documents");
        }
      }, 900);
    } catch (err: any) {
      clearInterval(timer);
      setProgress(0);
      setError(err.message || "Failed to upload document.");
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header matching company layout (Screenshot) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#18243A] tracking-tight">Upload Document</h1>
          <p className="text-[#6B778C] text-sm mt-0.5">
            Store your files securely and organize them by category.
          </p>
        </div>
        <Link
          href="/documents"
          className="btn btn-secondary self-start sm:self-auto gap-2 text-xs font-semibold"
        >
          <ArrowLeft size={14} />
          <span>Back to Documents</span>
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
          <span>Document uploaded successfully! Redirecting to document details...</span>
        </div>
      )}

      {/* Upload Form Card */}
      <div className="card p-6 sm:p-8 space-y-6 bg-white border border-[#E5EAF2] rounded-2xl shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Document Title */}
          <div>
            <label htmlFor="doc-title" className="label text-sm font-semibold text-[#18243A] mb-1.5 block">
              Document Title <span className="text-red-500">*</span>
            </label>
            <input
              id="doc-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Employment Agreement"
              className="input text-sm h-11"
              disabled={uploading || success}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="doc-desc" className="label text-sm font-semibold text-[#18243A] mb-1.5 block">
              Description
            </label>
            <textarea
              id="doc-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe this document"
              className="input text-sm py-2.5 resize-y"
              disabled={uploading || success}
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="doc-category" className="label text-sm font-semibold text-[#18243A] mb-1.5 block">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              id="doc-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input text-sm h-11 cursor-pointer bg-white"
              disabled={uploading || success}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Choose File */}
          <div>
            <label className="label text-sm font-semibold text-[#18243A] mb-1.5 block">
              Choose File <span className="text-red-500">*</span>
            </label>
            <div className="border border-[#CBD5E1] rounded-xl p-3 bg-[#FAFBFD] flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-secondary text-xs font-semibold py-2 px-3 shrink-0"
                disabled={uploading || success}
              >
                Choose File
              </button>
              <span className="text-xs text-[#6B778C] font-mono truncate flex-1">
                {file ? file.name : "No file chosen"}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.txt,.docx,.xlsx,.csv,.png,.jpg,.jpeg"
                className="hidden"
              />
            </div>
            <p className="text-[11px] text-[#6B778C] mt-1.5">
              Allowed: PDF, TXT, DOCX, XLSX, CSV, PNG, JPG, JPEG. Maximum size: 10 MB.
            </p>
          </div>

          {/* Security Notice Box */}
          <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/70 text-emerald-900 space-y-1">
            <div className="flex items-center gap-2 font-bold text-xs text-emerald-800">
              <Lock size={14} className="text-emerald-700 shrink-0" />
              <span>Security Notice</span>
            </div>
            <p className="text-xs text-emerald-800/90 leading-relaxed pl-5">
              Uploaded files are stored outside the public web directory. Only authorized users should be granted access.
            </p>
          </div>

          {/* Upload Progress Bar if uploading */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-[#6B778C]">
                <span>Encrypting and uploading file...</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-[#E5EAF2] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#10B981] transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={uploading || !file || success}
              className="btn btn-primary gap-2 text-sm font-semibold py-2.5 px-6 shadow-sm bg-[#10B981] hover:bg-[#059669] border-[#10B981]"
              style={{ backgroundColor: "#10B981", borderColor: "#10B981" }}
            >
              {uploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload size={16} />
                  <span>Upload Securely</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => router.push("/documents")}
              disabled={uploading}
              className="btn btn-secondary text-sm font-semibold py-2.5 px-5"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UploadPage() {
  return (
    <AuthLayout>
      <Suspense fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 size={32} className="animate-spin text-[#3478F6]" />
        </div>
      }>
        <UploadContent />
      </Suspense>
    </AuthLayout>
  );
}
