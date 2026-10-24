"use client";
import React, { useState, useRef, useEffect } from "react";
import { documentsApi } from "@/lib/api";
import { Upload, X, FileText, CheckCircle2, AlertCircle } from "lucide-react";

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
const ALLOWED_EXT = ["pdf", "docx", "xlsx", "csv", "txt", "png", "jpg", "jpeg"];

interface Props {
  onClose: () => void;
  initialCategory?: string;
}

export default function UploadModal({ onClose, initialCategory }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(initialCategory || "Finance");

  useEffect(() => {
    if (initialCategory) setCategory(initialCategory);
  }, [initialCategory]);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validate = (f: File): string | null => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXT.includes(ext)) return `File type .${ext} is not allowed.`;
    if (f.size > MAX_MB * 1024 * 1024) return `File exceeds ${MAX_MB} MB limit.`;
    return null;
  };

  const handleFile = (f: File) => {
    const err = validate(f);
    if (err) { setError(err); return; }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    // Simulate progress
    const timer = setInterval(() => setProgress((p) => Math.min(p + 15, 85)), 150);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title || file.name);
    fd.append("category", category);
    if (description) fd.append("description", description);
    try {
      await documentsApi.upload(fd);
      clearInterval(timer);
      setProgress(100);
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (err: any) {
      clearInterval(timer);
      setProgress(0);
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" style={{ maxWidth: 520 }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-[#18243A]">Upload Document</h2>
          <button onClick={onClose} className="btn btn-ghost p-1 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <CheckCircle2 size={48} className="text-[#16866B]" />
            <p className="font-semibold text-[#16866B]">Upload successful!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                dragging ? "border-[#3478F6] bg-[#EBF2FF]" : "border-[#E5EAF2] hover:border-[#3478F6] hover:bg-[#FAFBFD]"
              }`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
              aria-label="Drop zone"
            >
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText size={24} className="text-[#3478F6]" />
                  <div className="text-left">
                    <p className="font-medium text-sm text-[#18243A]">{file.name}</p>
                    <p className="text-xs text-[#6B778C]">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFile(null); setTitle(""); }}
                    className="ml-auto text-[#6B778C] hover:text-[#D64545]"
                  ><X size={14} /></button>
                </div>
              ) : (
                <>
                  <Upload size={28} className="mx-auto text-[#6B778C] mb-2" />
                  <p className="text-sm font-medium text-[#18243A]">Drop a file here or click to browse</p>
                  <p className="text-xs text-[#6B778C] mt-1">PDF, DOCX, XLSX, CSV, TXT, PNG, JPG · Max {MAX_MB} MB</p>
                </>
              )}
            </div>

            <div>
              <label className="label" htmlFor="doc-title">Document title *</label>
              <input id="doc-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Enter title" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="doc-category">Category</label>
                <select id="doc-category" className="input select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="doc-desc">Description (optional)</label>
              <textarea id="doc-desc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description…" />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-[#D64545] text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle size={15} className="shrink-0" />
                {error}
              </div>
            )}

            {uploading && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-[#6B778C]">
                  <span>Uploading…</span><span>{progress}%</span>
                </div>
                <div className="h-2 bg-[#E5EAF2] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3478F6] rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <button type="button" onClick={onClose} className="btn btn-secondary" disabled={uploading}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!file || uploading}>
                {uploading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Upload size={15} />}
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
