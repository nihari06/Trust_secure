"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";
import { documentsApi } from "@/lib/api";
import {
  Search, Filter, X, FileText, Download, Eye,
  Calendar, User, Tag, ArrowRight, Loader2, RefreshCw, Share2
} from "lucide-react";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [owner, setOwner] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const categories = ["Finance", "HR", "Report", "Contract", "Legal", "Technical", "Other"];

  const executeSearch = async (overrideQuery?: string) => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const params: any = {};
      const activeQuery = overrideQuery !== undefined ? overrideQuery : query;
      if (activeQuery.trim()) params.search = activeQuery.trim();
      if (category !== "all") params.category = category;
      if (owner.trim()) params.owner = owner.trim();
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      // Search both owned documents and shared documents
      const [owned, shared] = await Promise.all([
        documentsApi.list(params).catch(() => []),
        documentsApi.listShared(params).catch(() => []),
      ]);

      const merged = [
        ...(Array.isArray(owned) ? owned.map((d: any) => ({ ...d, source: "owned" })) : []),
        ...(Array.isArray(shared) ? shared.map((d: any) => ({ ...d, source: "shared" })) : []),
      ];

      // Deduplicate by ID
      const seen = new Set();
      const unique = merged.filter((d) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });

      setResults(unique);
    } catch (err: any) {
      setError(err.message || "Failed to search documents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkQuery = () => {
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const q = urlParams.get("query");
        if (q) {
          setQuery(q);
          executeSearch(q);
          return;
        }
      }
      executeSearch();
    };
    checkQuery();

    window.addEventListener("popstate", checkQuery);
    return () => window.removeEventListener("popstate", checkQuery);
  }, []);

  const handleReset = () => {
    setQuery("");
    setCategory("all");
    setOwner("");
    setFromDate("");
    setToDate("");
    setTimeout(() => {
      executeSearch("");
    }, 50);
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
      })
      .catch((e) => alert(e.message));
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        {/* Header - Matching Reference (Image 4) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold text-[#3478F6] uppercase tracking-wider mb-1">
              FIND YOUR FILES
            </div>
            <h1 className="text-2xl font-bold text-[#18243A] tracking-tight">Search Documents</h1>
            <p className="text-[#6B778C] text-sm mt-0.5">
              Find your documents by name, category, user, or upload date.
            </p>
          </div>
          <Link
            href="/documents"
            className="btn btn-secondary text-xs inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            &larr; Back to Documents
          </Link>
        </div>

        {/* 2x2 Filter Card - Matching Reference (Image 4) */}
        <div className="card p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Row 1 Col 1: Search Documents */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#18243A] block">
                Search Documents
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && executeSearch()}
                placeholder="Enter document title or filename"
                className="input text-sm h-10"
              />
            </div>

            {/* Row 1 Col 2: Search by Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#18243A] block">
                Search by Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input select text-sm h-10"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Row 2 Col 1: Search by User */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#18243A] block">
                Search by User
              </label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && executeSearch()}
                placeholder="Enter owner's username or email"
                className="input text-sm h-10"
              />
            </div>

            {/* Row 2 Col 2: Search by Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#18243A] flex items-center gap-1.5">
                <Calendar size={13} className="text-[#3478F6]" /> Search by Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="input text-sm h-10"
              />
              <p className="text-[11px] text-[#6B778C]">
                Select a date from the calendar to find documents uploaded on that day.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => executeSearch()}
              disabled={loading}
              className="btn btn-primary text-sm px-5 py-2 inline-flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Search Documents
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="btn btn-secondary text-sm px-4 py-2 inline-flex items-center gap-2"
            >
              <RefreshCw size={13} /> Reset Filters
            </button>
          </div>
        </div>

        {/* Error alert */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
            {error}
          </div>
        )}

        {/* Results section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#64748B] px-1">
            <span className="font-bold text-[#18243A] uppercase tracking-wider text-[11px]">
              {loading
                ? "Searching vault..."
                : `Found ${results.length} authorized document${results.length === 1 ? "" : "s"}`}
            </span>
            <span className="text-[11px] text-[#94A3B8]">
              Protected by server-side permission checks
            </span>
          </div>

          {loading ? (
            <div className="card p-12 text-center text-[#6B778C] space-y-3">
              <Loader2 size={24} className="animate-spin mx-auto text-[#3478F6]" />
              <p className="text-sm">Querying database for authorized records…</p>
            </div>
          ) : results.length === 0 ? (
            <div className="card p-12 text-center text-[#6B778C] space-y-3">
              <FileText size={32} className="mx-auto text-gray-300" />
              <h3 className="text-base font-semibold text-[#18243A]">No matching documents found</h3>
              <p className="text-xs max-w-sm mx-auto text-[#6B778C]">
                We couldn&apos;t find any documents matching your criteria that you are authorized to view.
              </p>
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-secondary text-xs mt-2"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((doc) => (
                <div key={doc.id} className="card p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="badge badge-blue text-[10px]">
                        {doc.category}
                      </span>
                      <span className="text-[10px] text-[#6B778C] bg-[#F1F4F9] px-2 py-0.5 rounded-full font-medium">
                        {doc.source === "owned" ? "Owned by Me" : "Shared"}
                      </span>
                    </div>
                    <h3 className="font-bold text-[#18243A] text-sm mb-1 line-clamp-1">
                      <Link href={`/documents/${doc.id}`} className="hover:text-[#3478F6] transition-colors">
                        {doc.title}
                      </Link>
                    </h3>
                    <p className="text-[11px] text-[#6B778C] font-mono truncate mb-3">
                      {doc.original_filename}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[#E5EAF2] flex items-center justify-between text-xs">
                    <span className="text-[#6B778C] text-[11px]">
                      {formatBytes(doc.file_size)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="btn btn-secondary btn-sm text-[11px] py-1 px-2.5 inline-flex items-center gap-1"
                        title="View Document Details"
                      >
                        <Eye size={12} /> View
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDownload(doc)}
                        className="btn btn-primary btn-sm text-[11px] py-1 px-2.5 inline-flex items-center gap-1"
                        title="Download Document"
                      >
                        <Download size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
