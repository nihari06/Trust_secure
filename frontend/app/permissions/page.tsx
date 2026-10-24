"use client";
import React, { useState, useEffect } from "react";
import AuthLayout from "@/components/AuthLayout";
import { documentsApi, usersApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import UploadModal from "@/components/UploadModal";
import AccessDenied from "@/components/AccessDenied";
import Link from "next/link";
import {
  Shield, UserCheck, UserX, Plus, Search, Filter,
  FileText, Clock, CheckCircle2, AlertCircle, X, ChevronDown,
  Users, UserPlus, ArrowRight, RefreshCw, Trash2,
  Upload, UserMinus, Sparkles, Eye, Lock
} from "lucide-react";
import { format } from "date-fns";

interface RecipientStaging {
  user_id: string;
  email: string;
  full_name: string;
  permission_level: "viewer" | "editor";
}

export default function PermissionsPage() {
  const { user: currentUser } = useAuth();
  const [showUploadModal, setShowUploadModal] = useState(false);

  const [docs, setDocs] = useState<any[]>([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedDocPerms, setSelectedDocPerms] = useState<any[]>([]);
  const [allPerms, setAllPerms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [permsLoading, setPermsLoading] = useState(false);

  // Search in all perms table
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "revoked">("active");

  // Multi-recipient sharing state
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [stagedRecipients, setStagedRecipients] = useState<RecipientStaging[]>([]);
  const [grantingBatch, setGrantingBatch] = useState(false);

  // Single action loading states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = async (initialDocId?: string) => {
    try {
      setLoading(true);
      const myDocs = await documentsApi.list();
      setDocs(myDocs || []);

      const activeId = initialDocId || selectedDocId || (myDocs && myDocs.length > 0 ? myDocs[0].id : "");
      if (activeId) {
        setSelectedDocId(activeId);
        loadSelectedDocPerms(activeId);
      }

      if (myDocs && myDocs.length > 0) {
        const permsPromises = myDocs.map(async (doc: any) => {
          try {
            const p = await documentsApi.permissions(doc.id);
            return (p || []).map((perm: any) => ({
              ...perm,
              doc_title: doc.title,
              doc_filename: doc.original_filename,
              doc_category: doc.category,
            }));
          } catch {
            return [];
          }
        });
        const nested = await Promise.all(permsPromises);
        setAllPerms(nested.flat());
      } else {
        setAllPerms([]);
      }
    } catch (e: any) {
      showToast(e.message || "Failed to load permissions.", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedDocPerms = async (docId: string) => {
    if (!docId) {
      setSelectedDocPerms([]);
      return;
    }
    try {
      setPermsLoading(true);
      const perms = await documentsApi.permissions(docId);
      setSelectedDocPerms(perms || []);
    } catch (e: any) {
      showToast(e.message || "Failed to load document permissions.", "error");
    } finally {
      setPermsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectDoc = (docId: string) => {
    setSelectedDocId(docId);
    setStagedRecipients([]);
    loadSelectedDocPerms(docId);
  };

  // Search registered users for sharing
  const handleSearchUsers = async (queryText: string) => {
    setUserQuery(queryText);
    if (!queryText.trim()) {
      setUserResults([]);
      return;
    }
    try {
      setSearchingUsers(true);
      const res = await usersApi.lookup({ query: queryText.trim(), limit: 10 });
      setUserResults(res?.items || []);
    } catch {
      setUserResults([]);
    } finally {
      setSearchingUsers(false);
    }
  };

  // Toggle user selection in staged list
  const toggleStageUser = (u: any) => {
    const exists = stagedRecipients.some((r) => r.user_id === u.id);
    if (exists) {
      setStagedRecipients(stagedRecipients.filter((r) => r.user_id !== u.id));
    } else {
      setStagedRecipients([
        ...stagedRecipients,
        {
          user_id: u.id,
          email: u.email,
          full_name: u.full_name,
          permission_level: "viewer",
        },
      ]);
    }
  };

  const updateStagedLevel = (userId: string, level: "viewer" | "editor") => {
    setStagedRecipients(
      stagedRecipients.map((r) =>
        r.user_id === userId ? { ...r, permission_level: level } : r
      )
    );
  };

  // Batch grant permissions to all staged recipients
  const handleBatchGrant = async () => {
    if (!selectedDocId || stagedRecipients.length === 0) return;
    try {
      setGrantingBatch(true);
      const payload = stagedRecipients.map((r) => ({
        grantee_email: r.email,
        permission_level: r.permission_level,
      }));
      const results = await documentsApi.batchGrant(selectedDocId, payload);
      const errorCount = results.filter((r: any) => r.status === "error").length;
      if (errorCount === 0) {
        showToast(`Successfully granted access to ${stagedRecipients.length} recipients.`);
      } else {
        showToast(`Granted with ${errorCount} errors. Please review recipients.`, "error");
      }
      setStagedRecipients([]);
      setUserQuery("");
      setUserResults([]);
      loadSelectedDocPerms(selectedDocId);
      loadData(selectedDocId);
    } catch (e: any) {
      showToast(e.message || "Failed to grant permissions.", "error");
    } finally {
      setGrantingBatch(false);
    }
  };

  // Change individual permission level
  const handleChangeLevel = async (permId: string, newLevel: "viewer" | "editor") => {
    try {
      setActionLoadingId(permId);
      await documentsApi.updatePermission(selectedDocId, permId, newLevel);
      showToast(`Updated permission to ${newLevel.toUpperCase()}`);
      loadSelectedDocPerms(selectedDocId);
      loadData(selectedDocId);
    } catch (e: any) {
      showToast(e.message || "Failed to update permission.", "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Revoke permission
  const handleRevoke = async (docId: string, permId: string, granteeEmail: string) => {
    try {
      setActionLoadingId(permId);
      await documentsApi.revokeAccess(docId, permId);
      showToast(`Access revoked for ${granteeEmail}`);
      if (docId === selectedDocId) {
        loadSelectedDocPerms(selectedDocId);
      }
      loadData(selectedDocId);
    } catch (err: any) {
      showToast(err.message || "Failed to revoke access.", "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Restore/Reactivate permission
  const handleRestore = async (granteeEmail: string, level: string) => {
    if (!selectedDocId) return;
    try {
      setActionLoadingId(granteeEmail);
      await documentsApi.grantAccess(selectedDocId, granteeEmail, level);
      showToast(`Restored access for ${granteeEmail}`);
      loadSelectedDocPerms(selectedDocId);
      loadData(selectedDocId);
    } catch (e: any) {
      showToast(e.message || "Failed to restore access.", "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  const selectedDoc = docs.find((d) => d.id === selectedDocId);

  const filteredPerms = allPerms.filter((p) => {
    const matchesSearch =
      !search ||
      p.doc_title.toLowerCase().includes(search.toLowerCase()) ||
      p.grantee_email?.toLowerCase().includes(search.toLowerCase()) ||
      p.grantee_name?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && p.is_active) ||
      (statusFilter === "revoked" && !p.is_active);

    return matchesSearch && matchesStatus;
  });

  const activeCount = allPerms.filter((p) => p.is_active).length;
  const revokedCount = allPerms.filter((p) => !p.is_active).length;

  if (currentUser && currentUser.role !== "admin" && currentUser.role !== "owner") {
    return (
      <AuthLayout>
        <AccessDenied
          title="Access Denied"
          message="Only administrators and document owners can manage access permissions. If you believe this is a mistake, contact your administrator."
          backHref="/documents"
          backLabel="Back to Documents"
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          onClose={() => {
            setShowUploadModal(false);
            loadData();
          }}
        />
      )}

      {/* Toast */}
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
            <Shield size={14} /> Security Policy & Delegation
          </div>
          <h1 className="text-2xl font-bold text-[#18243A] tracking-tight">Access & Permissions</h1>
          <p className="text-[#6B778C] text-sm mt-0.5">
            Select a document, search registered users by name or email, and manage independent multi-recipient access.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentUser?.role !== "viewer" && currentUser?.role !== "editor" && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="btn btn-primary text-xs shadow-sm"
            >
              <Upload size={14} /> Upload Document
            </button>
          )}
        </div>
      </div>

      {/* ── Employee Offboarding Callout ─────────────────────────── */}
      <div className="card p-4 mb-6 border border-amber-200 bg-amber-50/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
            <UserMinus size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-[#18243A]">Departing Employee Access Revocation & Offboarding</h4>
              <span className="badge badge-orange text-[10px] font-semibold">Immediate Zero-Trust Revocation</span>
            </div>
            <p className="text-xs text-[#6B778C] mt-1 max-w-3xl leading-relaxed">
              When any person leaves the company completely, administrators execute <strong>1-Click Employee Offboarding</strong>.
              This immediately terminates all active login sessions & JWT tokens across devices, revokes all document permissions, and safely transfers document ownership to a designated successor.
            </p>
          </div>
        </div>
        <Link
          href="/admin/users"
          className="btn btn-sm bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 text-xs shrink-0 inline-flex items-center gap-1.5 shadow-2xs font-semibold"
        >
          <UserMinus size={13} />
          Go to User Management & Offboard
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-icon bg-blue-50 text-[#3478F6]">
            <Shield size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-[#6B778C] uppercase">Active Grants</p>
            <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">{activeCount}</h3>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-amber-50 text-amber-600">
            <Clock size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-[#6B778C] uppercase">Revoked / Inactive</p>
            <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">{revokedCount}</h3>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-emerald-50 text-emerald-600">
            <FileText size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-[#6B778C] uppercase">Protected Documents</p>
            <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">{docs.length}</h3>
          </div>
        </div>
      </div>

      {/* ── Role & Permission Capability Matrix ────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-3.5 border border-[#E5EAF2] hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between mb-1.5">
            <span className="badge badge-purple text-[11px] font-bold">VIEWER ROLE</span>
            <Eye size={15} className="text-purple-600" />
          </div>
          <h4 className="text-xs font-bold text-[#18243A] mb-0.5">Read & Download Access</h4>
          <p className="text-[11px] text-[#6B778C] leading-relaxed">
            Can preview in-browser and download file contents. Cannot edit, share, or delete.
          </p>
        </div>

        <div className="card p-3.5 border border-[#E5EAF2] hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between mb-1.5">
            <span className="badge badge-green text-[11px] font-bold">EDITOR ROLE</span>
            <FileText size={15} className="text-emerald-600" />
          </div>
          <h4 className="text-xs font-bold text-[#18243A] mb-0.5">Modify & Replace Access</h4>
          <p className="text-[11px] text-[#6B778C] leading-relaxed">
            Can edit document metadata and update file versions. Cannot grant permissions or delete.
          </p>
        </div>

        <div className="card p-3.5 border border-[#E5EAF2] hover:border-blue-300 transition-colors">
          <div className="flex items-center justify-between mb-1.5">
            <span className="badge badge-blue text-[11px] font-bold">DOCUMENT OWNER</span>
            <Shield size={15} className="text-[#3478F6]" />
          </div>
          <h4 className="text-xs font-bold text-[#18243A] mb-0.5">Full Delegation Authority</h4>
          <p className="text-[11px] text-[#6B778C] leading-relaxed">
            Exclusive power to grant Viewer/Editor roles, independently revoke access, and delete files.
          </p>
        </div>

        <div className="card p-3.5 border border-[#E5EAF2] hover:border-red-300 transition-colors">
          <div className="flex items-center justify-between mb-1.5">
            <span className="badge badge-red text-[11px] font-bold">ADMINISTRATOR</span>
            <Lock size={15} className="text-red-600" />
          </div>
          <h4 className="text-xs font-bold text-[#18243A] mb-0.5">Offboarding & Audit</h4>
          <p className="text-[11px] text-[#6B778C] leading-relaxed">
            Executes 1-click employee offboarding, invalidates active sessions, and audits cryptographic chain.
          </p>
        </div>
      </div>

      {/* Main Document-Centric Workspace */}
      <div className="card p-6 mb-8 border border-[#E5EAF2]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#E5EAF2] mb-6">
          <div className="flex-1">
            <label className="text-xs font-bold text-[#6B778C] uppercase tracking-wider block mb-1.5">
              1. Select Document to Manage
            </label>
            {docs.length === 0 ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-[#6B778C]">No documents uploaded under current account ({currentUser?.email}).</p>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="btn btn-primary btn-sm text-xs"
                >
                  <Upload size={13} /> Upload Document Now
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={selectedDocId}
                  onChange={(e) => handleSelectDoc(e.target.value)}
                  className="input select max-w-md font-semibold text-[#18243A]"
                >
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.original_filename})
                    </option>
                  ))}
                </select>
                {selectedDoc && (
                  <span className="badge badge-blue text-xs hidden sm:inline-flex">
                    {selectedDoc.category || "General"}
                  </span>
                )}
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="btn btn-secondary btn-sm text-xs"
                  title="Upload another document"
                >
                  <Plus size={13} /> Add Document
                </button>
              </div>
            )}
          </div>

          {selectedDoc && (
            <div className="text-left lg:text-right">
              <p className="text-xs text-[#6B778C]">Current Active Collaborators</p>
              <p className="text-lg font-bold text-[#18243A]">
                {selectedDocPerms.filter((p) => p.is_active).length} Users
              </p>
            </div>
          )}
        </div>

        {!selectedDocId && (
          <div className="py-12 px-6 text-center">
            <div className="w-14 h-14 bg-blue-50 text-[#3478F6] rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xs">
              <FileText size={28} />
            </div>
            <h3 className="font-bold text-base text-[#18243A] mb-1">Select or Upload a Document to Grant Permissions</h3>
            <p className="text-xs text-[#6B778C] max-w-lg mx-auto mb-5 leading-relaxed">
              In TrustVault's zero-trust model, permissions are granted by document owners.
              Upload a confidential document to grant independent Viewer and Editor access, or select one of your owned documents above.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {currentUser?.role !== "viewer" && currentUser?.role !== "editor" && (
                <button onClick={() => setShowUploadModal(true)} className="btn btn-primary text-xs">
                  <Upload size={14} /> Upload Document
                </button>
              )}
            </div>
          </div>
        )}

        {selectedDocId && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Multi-Recipient User Search & Staging (5 cols) */}
            <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-[#E5EAF2] lg:pr-8 pb-6 lg:pb-0">
              <div className="flex items-center gap-2 mb-3">
                <UserPlus size={18} className="text-[#3478F6]" />
                <h3 className="font-bold text-base text-[#18243A]">Share with Multiple Recipients</h3>
              </div>
              <p className="text-xs text-[#6B778C] mb-4">
                Search registered users by name or email, select multiple recipients, and assign individual permissions.
              </p>

              {/* User search bar */}
              <div className="relative mb-3">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B778C]" />
                <input
                  type="text"
                  className="input input-with-icon text-sm"
                  placeholder="Search registered user name or email..."
                  value={userQuery}
                  onChange={(e) => handleSearchUsers(e.target.value)}
                />
                {searchingUsers && (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                  </div>
                )}
              </div>

              {/* Search results list */}
              {userResults.length > 0 && (
                <div className="mb-4 bg-white border border-[#E5EAF2] rounded-xl shadow-xs max-h-48 overflow-y-auto divide-y divide-[#E5EAF2]">
                  {userResults.map((u) => {
                    const isSelected = stagedRecipients.some((r) => r.user_id === u.id);
                    const alreadyHasPerm = selectedDocPerms.some((p) => p.grantee_id === u.id && p.is_active);
                    return (
                      <div
                        key={u.id}
                        onClick={() => !alreadyHasPerm && toggleStageUser(u)}
                        className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                          alreadyHasPerm
                            ? "bg-gray-50 opacity-60 cursor-not-allowed"
                            : isSelected
                            ? "bg-blue-50/60"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold text-[#18243A] truncate">{u.full_name}</p>
                          <p className="text-[11px] text-[#6B778C] truncate">{u.email}</p>
                        </div>
                        <div>
                          {alreadyHasPerm ? (
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium border border-emerald-200">
                              Has Access
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleStageUser(u)}
                              className="rounded text-[#3478F6] focus:ring-0 cursor-pointer"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {userQuery && !searchingUsers && userResults.length === 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2.5 rounded-lg mb-4">
                  No registered users found matching "{userQuery}".
                </p>
              )}

              {/* Staged Recipients Box */}
              <div className="bg-[#F9FAFC] border border-[#E5EAF2] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-[#18243A] uppercase tracking-wider">
                    Selected Recipients ({stagedRecipients.length})
                  </h4>
                  {stagedRecipients.length > 0 && (
                    <button
                      onClick={() => setStagedRecipients([])}
                      className="text-[11px] text-[#6B778C] hover:text-red-600"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {stagedRecipients.length === 0 ? (
                  <p className="text-xs text-[#6B778C] text-center py-6">
                    Type a user's name or email above and select them to add to this grant batch.
                  </p>
                ) : (
                  <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
                    {stagedRecipients.map((r) => (
                      <div
                        key={r.user_id}
                        className="bg-white border border-[#E5EAF2] rounded-lg p-2.5 flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-[#18243A] truncate">{r.full_name}</p>
                          <p className="text-[11px] text-[#6B778C] truncate">{r.email}</p>
                        </div>

                        {/* Individual Role Selector */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <select
                            value={r.permission_level}
                            onChange={(e) =>
                              updateStagedLevel(r.user_id, e.target.value as "viewer" | "editor")
                            }
                            className="select text-xs h-8 px-2 font-medium border border-[#E5EAF2] rounded-lg bg-white"
                          >
                            <option value="viewer">Viewer (Read)</option>
                            <option value="editor">Editor (Edit)</option>
                          </select>
                          <button
                            onClick={() => toggleStageUser({ id: r.user_id })}
                            className="text-gray-400 hover:text-red-600 p-1"
                            title="Remove from selection"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleBatchGrant}
                  disabled={stagedRecipients.length === 0 || grantingBatch}
                  className="btn btn-primary w-full justify-center py-2 text-xs font-semibold"
                >
                  {grantingBatch ? (
                    <span className="spinner" style={{ width: 14, height: 14 }} />
                  ) : (
                    <UserCheck size={14} />
                  )}
                  Grant Access to {stagedRecipients.length} Recipient{stagedRecipients.length === 1 ? "" : "s"}
                </button>
              </div>
            </div>

            {/* Right: Current Document Access List (7 cols) */}
            <div className="lg:col-span-7">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-[#3478F6]" />
                  <h3 className="font-bold text-base text-[#18243A]">
                    Users With Access To This Document
                  </h3>
                </div>
                <button
                  onClick={() => loadSelectedDocPerms(selectedDocId)}
                  className="text-xs text-[#3478F6] hover:underline flex items-center gap-1"
                >
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>
              <p className="text-xs text-[#6B778C] mb-4">
                Grant, change permission levels, and revoke each recipient's permission independently.
              </p>

              {permsLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <div className="spinner" style={{ width: 24, height: 24 }} />
                  <p className="text-xs text-[#6B778C]">Loading permissions...</p>
                </div>
              ) : selectedDocPerms.length === 0 ? (
                <div className="empty-state py-12 border border-dashed border-[#E5EAF2] rounded-xl">
                  <Shield size={36} className="mx-auto mb-2 opacity-30 text-[#3478F6]" />
                  <h4 className="text-sm font-semibold text-[#18243A]">Document is Private</h4>
                  <p className="text-xs text-[#6B778C] mt-1 max-w-xs mx-auto">
                    This document is only accessible by you. Search and select recipients on the left to share it.
                  </p>
                </div>
              ) : (
                <div className="border border-[#E5EAF2] rounded-xl overflow-hidden divide-y divide-[#E5EAF2]">
                  {selectedDocPerms.map((perm) => (
                    <div
                      key={perm.id}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        perm.is_active ? "bg-white hover:bg-[#FAFBFD]" : "bg-gray-50/70"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-[#18243A] truncate">
                            {perm.grantee_name || perm.grantee_email}
                          </p>
                          {perm.is_active ? (
                            <span className="badge badge-green text-[10px]">Active</span>
                          ) : (
                            <span className="badge badge-red text-[10px]">Revoked</span>
                          )}
                        </div>
                        <p className="text-xs text-[#6B778C] truncate">{perm.grantee_email}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Granted: {format(new Date(perm.created_at), "MMM d, yyyy HH:mm")}
                          {perm.revoked_at && ` · Revoked: ${format(new Date(perm.revoked_at), "MMM d, HH:mm")}`}
                        </p>
                      </div>

                      {/* Permission Controls */}
                      <div className="flex items-center gap-2 shrink-0">
                        {perm.is_active ? (
                          <>
                            {/* Inline Permission Level Selector */}
                            <select
                              value={perm.permission_level}
                              onChange={(e) =>
                                handleChangeLevel(perm.id, e.target.value as "viewer" | "editor")
                              }
                              disabled={actionLoadingId === perm.id}
                              className="select text-xs h-8 px-2 font-medium border border-[#E5EAF2] rounded-lg bg-white"
                            >
                              <option value="viewer">Viewer (Read-only)</option>
                              <option value="editor">Editor (Read & Edit)</option>
                            </select>

                            {/* Revoke Button */}
                            <button
                              onClick={() =>
                                handleRevoke(selectedDocId, perm.id, perm.grantee_email)
                              }
                              disabled={actionLoadingId === perm.id}
                              className="btn btn-danger btn-sm text-xs h-8 px-2.5"
                              title="Revoke recipient's access immediately"
                            >
                              {actionLoadingId === perm.id ? (
                                <span className="spinner" style={{ width: 12, height: 12 }} />
                              ) : (
                                <UserX size={13} />
                              )}
                              Revoke
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() =>
                              handleRestore(perm.grantee_email, perm.permission_level)
                            }
                            disabled={actionLoadingId === perm.grantee_email}
                            className="btn btn-secondary btn-sm text-xs h-8"
                          >
                            {actionLoadingId === perm.grantee_email ? (
                              <span className="spinner" style={{ width: 12, height: 12 }} />
                            ) : (
                              <UserCheck size={13} />
                            )}
                            Restore Access
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Global Permissions Overview Table */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-[#18243A]">All Granted Document Permissions</h2>
        <p className="text-xs text-[#6B778C]">Comprehensive overview across all documents you own.</p>
      </div>

      <div className="card p-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B778C] pointer-events-none" />
          <input
            className="input input-with-icon"
            placeholder="Search by doc title, grantee name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {(["active", "revoked", "all"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`pill-filter capitalize ${statusFilter === tab ? "active" : ""}`}
            >
              {tab === "all" ? "All Records" : `${tab} Only`}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <p className="text-xs text-[#6B778C]">Querying access permissions...</p>
          </div>
        ) : filteredPerms.length === 0 ? (
          <div className="empty-state py-12">
            <Shield size={42} className="mx-auto mb-3 opacity-30 text-[#3478F6]" />
            <h3 className="text-sm font-semibold text-[#18243A]">No permission records found</h3>
            <p className="text-xs text-[#6B778C] mt-1 max-w-sm mx-auto">
              {search
                ? "No permissions matched your search criteria."
                : "No external permissions are currently granted."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Grantee</th>
                  <th>Permission Level</th>
                  <th>Status</th>
                  <th>Granted On</th>
                  <th>Revoked On</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPerms.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F9FAFC] transition-colors">
                    <td>
                      <div>
                        <p className="font-semibold text-[#18243A] text-sm">{p.doc_title}</p>
                        <p className="text-xs text-[#6B778C]">{p.doc_filename}</p>
                      </div>
                    </td>
                    <td>
                      <div>
                        <span className="font-medium text-[#18243A] text-sm block">{p.grantee_name}</span>
                        <span className="text-xs text-[#6B778C]">{p.grantee_email}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                        p.permission_level === "editor"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}>
                        <Shield size={12} />
                        {p.permission_level.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {p.is_active ? (
                        <span className="badge badge-green">
                          <CheckCircle2 size={12} /> Active
                        </span>
                      ) : (
                        <span className="badge badge-red">
                          <UserX size={12} /> Revoked
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-[#6B778C]">
                      {format(new Date(p.created_at), "MMM d, yyyy HH:mm")}
                    </td>
                    <td className="text-xs text-[#6B778C]">
                      {p.revoked_at ? format(new Date(p.revoked_at), "MMM d, yyyy HH:mm") : "—"}
                    </td>
                    <td className="text-right">
                      {p.is_active ? (
                        <button
                          onClick={() => handleRevoke(p.document_id, p.id, p.grantee_email)}
                          className="btn btn-danger btn-sm text-xs"
                          disabled={actionLoadingId === p.id}
                        >
                          {actionLoadingId === p.id ? (
                            <span className="spinner" style={{ width: 12, height: 12 }} />
                          ) : (
                            <UserX size={13} />
                          )}
                          Revoke Access
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRestore(p.grantee_email, p.permission_level)}
                          className="btn btn-secondary btn-sm text-xs"
                          disabled={actionLoadingId === p.grantee_email}
                        >
                          Restore
                        </button>
                      )}
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
