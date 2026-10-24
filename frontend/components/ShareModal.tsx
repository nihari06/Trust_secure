"use client";
import React, { useState, useEffect } from "react";
import { documentsApi, usersApi } from "@/lib/api";
import { X, Search, UserPlus, Shield, Trash2, AlertCircle, Info, CheckCircle2, Users } from "lucide-react";

interface Props { doc: any; onClose: () => void; }

interface StagedUser {
  user_id: string;
  email: string;
  full_name: string;
  permission_level: "viewer" | "editor";
}

export default function ShareModal({ doc, onClose }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [stagedUsers, setStagedUsers] = useState<StagedUser[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPermissions = () => {
    documentsApi.permissions(doc.id)
      .then(setPermissions)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPermissions();
  }, [doc.id]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    setError(null);
    if (!val.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await usersApi.lookup({ query: val.trim(), limit: 8 });
      setSearchResults(res?.items || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const toggleSelectUser = (u: any) => {
    const exists = stagedUsers.some((x) => x.user_id === u.id);
    if (exists) {
      setStagedUsers(stagedUsers.filter((x) => x.user_id !== u.id));
    } else {
      setStagedUsers([
        ...stagedUsers,
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
    setStagedUsers(
      stagedUsers.map((u) => (u.user_id === userId ? { ...u, permission_level: level } : u))
    );
  };

  const handleBatchGrant = async () => {
    if (stagedUsers.length === 0) return;
    setGranting(true);
    setError(null);
    try {
      const payload = stagedUsers.map((u) => ({
        grantee_email: u.email,
        permission_level: u.permission_level,
      }));
      await documentsApi.batchGrant(doc.id, payload);
      setStagedUsers([]);
      setSearchQuery("");
      setSearchResults([]);
      showToast(`Access granted to ${payload.length} recipient${payload.length === 1 ? "" : "s"}.`);
      loadPermissions();
    } catch (e: any) {
      setError(e.message || "Failed to grant access.");
    } finally {
      setGranting(false);
    }
  };

  const handleChangeLevel = async (permId: string, level: "viewer" | "editor") => {
    setActionId(permId);
    try {
      await documentsApi.updatePermission(doc.id, permId, level);
      showToast(`Permission level updated to ${level.toUpperCase()}`);
      loadPermissions();
    } catch (e: any) {
      setError(e.message || "Failed to update permission.");
    } finally {
      setActionId(null);
    }
  };

  const handleRevoke = async (permId: string, name: string) => {
    setActionId(permId);
    try {
      await documentsApi.revokeAccess(doc.id, permId);
      showToast(`Access revoked for ${name}`);
      loadPermissions();
    } catch (e: any) {
      setError(e.message || "Failed to revoke.");
    } finally {
      setActionId(null);
    }
  };

  const activePerms = permissions.filter((p) => p.is_active);

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" style={{ maxWidth: 580, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E5EAF2]">
          <div>
            <h2 className="text-lg font-bold text-[#18243A]">Share Document</h2>
            <p className="text-xs text-[#6B778C] truncate max-w-[360px]">{doc.title} ({doc.original_filename})</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost p-1 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {toast && (
          <div className="mb-4 text-xs text-[#16866B] bg-[#ECFDF5] border border-[#16866B]/20 rounded-lg px-3.5 py-2 flex items-center gap-2">
            <CheckCircle2 size={14} />
            <span>{toast}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 mb-4 text-xs text-[#D64545] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Multi-recipient Search and Selection Box */}
        <div className="p-4 bg-[#FAFBFD] border border-[#E5EAF2] rounded-xl mb-5">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus size={16} className="text-[#3478F6]" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#18243A]">
              Add Multiple Recipients
            </h3>
          </div>

          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B778C] pointer-events-none" />
            <input
              className="input input-with-icon text-xs h-9"
              style={{ paddingLeft: "36px" }}
              placeholder="Search registered users by name or email…"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="spinner" style={{ width: 12, height: 12 }} />
              </div>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="mb-3 bg-white border border-[#E5EAF2] rounded-lg max-h-40 overflow-y-auto divide-y divide-[#E5EAF2] shadow-2xs">
              {searchResults.map((u) => {
                const isSelected = stagedUsers.some((x) => x.user_id === u.id);
                const hasAccess = activePerms.some((p) => p.grantee_id === u.id);
                return (
                  <div
                    key={u.id}
                    onClick={() => !hasAccess && toggleSelectUser(u)}
                    className={`p-2.5 flex items-center justify-between text-xs cursor-pointer ${
                      hasAccess ? "bg-gray-50 opacity-60 cursor-not-allowed" : isSelected ? "bg-blue-50/60" : "hover:bg-gray-50"
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-[#18243A]">{u.full_name}</p>
                      <p className="text-[11px] text-[#6B778C]">{u.email}</p>
                    </div>
                    <div>
                      {hasAccess ? (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium border border-emerald-200">
                          Active Access
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectUser(u)}
                          className="rounded text-[#3478F6] focus:ring-0 cursor-pointer"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Staged Recipients */}
          {stagedUsers.length > 0 && (
            <div className="space-y-2 mb-3">
              <p className="text-[11px] font-bold text-[#6B778C] uppercase tracking-wider">
                Selected for Sharing ({stagedUsers.length}):
              </p>
              {stagedUsers.map((u) => (
                <div
                  key={u.user_id}
                  className="bg-white border border-[#E5EAF2] rounded-lg p-2 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#18243A] truncate">{u.full_name}</p>
                    <p className="text-[10px] text-[#6B778C] truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select
                      className="select text-xs h-8 px-2 font-medium border border-[#E5EAF2] rounded-lg bg-white"
                      value={u.permission_level}
                      onChange={(e) => updateStagedLevel(u.user_id, e.target.value as "viewer" | "editor")}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button
                      onClick={() => toggleSelectUser({ id: u.user_id })}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
              <button
                className="btn btn-primary btn-sm w-full justify-center py-2 text-xs mt-2"
                onClick={handleBatchGrant}
                disabled={granting}
              >
                {granting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <UserPlus size={14} />}
                Confirm Grant for {stagedUsers.length} Recipient{stagedUsers.length === 1 ? "" : "s"}
              </button>
            </div>
          )}
        </div>

        {/* Current Active Access List */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Users size={16} className="text-[#3478F6]" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#18243A]">
              Current Collaborators ({activePerms.length})
            </h3>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><div className="spinner" /></div>
        ) : activePerms.length === 0 ? (
          <p className="text-xs text-[#6B778C] text-center py-4 bg-gray-50 border border-dashed border-[#E5EAF2] rounded-lg">
            This document is private to you. No other users have access.
          </p>
        ) : (
          <div className="divide-y divide-[#E5EAF2] border border-[#E5EAF2] rounded-xl overflow-hidden mb-4">
            {activePerms.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#FAFBFD] text-xs">
                <div className="w-7 h-7 rounded-full bg-[#3478F6]/10 text-[#3478F6] flex items-center justify-center font-bold text-xs shrink-0">
                  {(p.grantee_name || p.grantee_email || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#18243A] truncate">{p.grantee_name || p.grantee_email}</p>
                  <p className="text-[10px] text-[#6B778C] truncate">{p.grantee_email}</p>
                </div>
                {/* Individual Permission Level Selector */}
                <select
                  value={p.permission_level}
                  onChange={(e) => handleChangeLevel(p.id, e.target.value as "viewer" | "editor")}
                  disabled={actionId === p.id}
                  className="select text-xs h-8 px-2 font-medium border border-[#E5EAF2] rounded-lg bg-white"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button
                  onClick={() => handleRevoke(p.id, p.grantee_name || p.grantee_email)}
                  className="btn btn-ghost btn-sm p-1.5 text-[#D64545] hover:bg-red-50 rounded-lg"
                  disabled={actionId === p.id}
                  title="Revoke access"
                >
                  {actionId === p.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Trash2 size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Revocation notice */}
        <div className="flex items-start gap-2 p-3 bg-[#FFFBEB] border border-[#A66C12]/20 rounded-lg">
          <Info size={14} className="text-[#A66C12] mt-0.5 shrink-0" />
          <p className="text-[11px] text-[#A66C12]">
            Permissions are checked in real-time. Revoking access or modifying roles takes effect on the recipient's very next request.
          </p>
        </div>
      </div>
    </div>
  );
}
