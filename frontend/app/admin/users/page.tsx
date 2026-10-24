"use client";
import React, { useState, useEffect } from "react";
import AuthLayout from "@/components/AuthLayout";
import { useAuth } from "@/lib/auth-context";
import { usersApi, documentsApi } from "@/lib/api";
import {
  Users, UserPlus, Search, Shield, CheckCircle2,
  XCircle, Edit2, X, AlertCircle, AlertTriangle,
  LogOut, ChevronRight, FileText, ArrowRightLeft,
  UserMinus, Clock, Info
} from "lucide-react";
import { format } from "date-fns";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-50 text-red-700 border-red-200",
  owner: "bg-blue-50 text-blue-700 border-blue-200",
  editor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  viewer: "bg-purple-50 text-purple-700 border-purple-200",
};

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);

  // Offboard state
  const [offboardUser, setOffboardUser] = useState<any>(null);
  const [offboardSummary, setOffboardSummary] = useState<any>(null);
  const [offboardSummaryLoading, setOffboardSummaryLoading] = useState(false);
  const [selectedNewOwner, setSelectedNewOwner] = useState("");
  const [offboardReason, setOffboardReason] = useState("Employee offboarding");
  const [offboarding, setOffboarding] = useState(false);
  const [offboardResult, setOffboardResult] = useState<any>(null);

  // Form states
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [creating, setCreating] = useState(false);

  // Edit states
  const [editRole, setEditRole] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadUsers = async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      const data = await usersApi.list({
        search: search.trim() || undefined,
        role: roleFilter !== "all" ? roleFilter : undefined,
      });
      setUsers(data || []);
    } catch (e: any) {
      showToast(e.message || "Failed to load user directory.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [isAdmin, roleFilter]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      await usersApi.create({
        email: newEmail.trim(),
        full_name: newName.trim(),
        password: newPassword,
        role: newRole,
      });
      showToast(`User ${newEmail} created successfully.`);
      setShowCreateModal(false);
      setNewEmail(""); setNewName(""); setNewPassword(""); setNewRole("viewer");
      loadUsers();
    } catch (err: any) {
      showToast(err.message || "Failed to create user.", "error");
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (u: any) => {
    setEditUser(u);
    setEditRole(u.role);
    setEditActive(u.is_active);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      setUpdating(true);
      await usersApi.update(editUser.id, { role: editRole, is_active: editActive });
      showToast(`Updated ${editUser.email}.`);
      setEditUser(null);
      loadUsers();
    } catch (err: any) {
      showToast(err.message || "Failed to update user.", "error");
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleActive = async (u: any) => {
    if (u.id === currentUser?.id) {
      showToast("You cannot deactivate your own account.", "error");
      return;
    }
    try {
      await usersApi.update(u.id, { is_active: !u.is_active });
      showToast(`User ${u.email} is now ${!u.is_active ? "active" : "inactive"}.`);
      loadUsers();
    } catch (err: any) {
      showToast(err.message || "Failed to toggle user status.", "error");
    }
  };

  // Offboarding
  const openOffboardModal = async (u: any) => {
    setOffboardUser(u);
    setOffboardResult(null);
    setSelectedNewOwner("");
    setOffboardReason("Employee offboarding");
    setOffboardSummary(null);
    setOffboardSummaryLoading(true);
    try {
      const summary = await usersApi.offboardSummary(u.id);
      setOffboardSummary(summary);
      if (summary?.potential_owners?.length > 0) {
        setSelectedNewOwner(summary.potential_owners[0].id);
      }
    } catch (err: any) {
      showToast("Failed to load offboard summary: " + (err.message || ""), "error");
    } finally {
      setOffboardSummaryLoading(false);
    }
  };

  const handleConfirmOffboard = async () => {
    if (!offboardUser) return;
    const hasDocs = offboardSummary?.owned_documents_count > 0;
    if (hasDocs && !selectedNewOwner) {
      showToast("Please select a new document owner before offboarding.", "error");
      return;
    }
    try {
      setOffboarding(true);
      const result = await usersApi.offboard(offboardUser.id, {
        transfer_documents_to_user_id: hasDocs ? selectedNewOwner : undefined,
        reason: offboardReason || "Employee offboarding",
      });
      setOffboardResult(result);
      showToast(`Offboarding complete: ${result.email} deactivated.`);
      loadUsers();
    } catch (err: any) {
      showToast("Offboarding failed: " + (err.message || ""), "error");
    } finally {
      setOffboarding(false);
    }
  };

  if (!isAdmin) {
    return (
      <AuthLayout>
        <div className="card p-12 text-center max-w-lg mx-auto my-16">
          <Shield size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-[#18243A]">Restricted Administration Area</h2>
          <p className="text-sm text-[#6B778C] mt-2">
            You are logged in as <strong>{currentUser?.role}</strong>. User management is restricted to administrators only.
          </p>
        </div>
      </AuthLayout>
    );
  }

  const adminCount = users.filter((u) => u.role === "admin").length;
  const ownerCount = users.filter((u) => u.role === "owner").length;
  const activeCount = users.filter((u) => u.is_active).length;
  const inactiveCount = users.filter((u) => !u.is_active).length;

  return (
    <AuthLayout>
      {toast && (
        <div className={`toast ${toast.type}`}>
          <div className="flex items-center gap-2">
            {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* ── Create User Modal ─────────────────────────────────── */}
      {showCreateModal && (
        <div className="dialog-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="dialog" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAF2] mb-4">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-[#3478F6]" />
                <h3 className="font-bold text-[#18243A] text-base">Provision New User Account</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-[#6B778C] hover:text-[#18243A]"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input className="input" placeholder="e.g. Elena Rostova" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div>
                <label className="label">Corporate Email</label>
                <input type="email" className="input" placeholder="name@trustvault.dev" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
              </div>
              <div>
                <label className="label">Temporary Password</label>
                <input type="password" className="input" placeholder="At least 8 characters..." value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </div>
              <div>
                <label className="label">System Role</label>
                <select className="input select" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="viewer">Viewer (Read & download shared files)</option>
                  <option value="editor">Editor (Modify shared files)</option>
                  <option value="owner">Owner (Upload & share own documents)</option>
                  <option value="admin">Admin (Full system access)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-[#E5EAF2]">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
                  {creating ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <UserPlus size={14} />}
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ───────────────────────────────────── */}
      {editUser && (
        <div className="dialog-overlay" onClick={() => setEditUser(null)}>
          <div className="dialog" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAF2] mb-4">
              <div className="flex items-center gap-2">
                <Edit2 size={18} className="text-[#3478F6]" />
                <h3 className="font-bold text-[#18243A] text-base">Edit User Permissions</h3>
              </div>
              <button onClick={() => setEditUser(null)} className="text-[#6B778C] hover:text-[#18243A]"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="bg-[#F6F8FC] p-3 rounded-lg text-xs space-y-1">
                <p className="font-bold text-[#18243A] text-sm">{editUser.full_name}</p>
                <p className="text-[#6B778C]">{editUser.email}</p>
              </div>
              <div>
                <label className="label">Assigned Role</label>
                <select className="input select" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="label">Account Status</label>
                <div className="flex items-center gap-3 mt-2">
                  <label className="flex items-center gap-2 text-sm text-[#18243A] cursor-pointer">
                    <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="rounded text-[#3478F6] focus:ring-[#3478F6]" />
                    <span>Account Active (Allowed to sign in)</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-[#E5EAF2]">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditUser(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={updating}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Offboarding Modal ─────────────────────────────────── */}
      {offboardUser && (
        <div className="dialog-overlay" onClick={() => { if (!offboarding) { setOffboardUser(null); setOffboardResult(null); } }}>
          <div
            className="dialog"
            style={{ maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAF2] mb-4">
              <div className="flex items-center gap-2">
                <UserMinus size={18} className="text-red-600" />
                <h3 className="font-bold text-[#18243A] text-base">Employee Offboarding</h3>
              </div>
              {!offboarding && (
                <button onClick={() => { setOffboardUser(null); setOffboardResult(null); }} className="text-[#6B778C] hover:text-[#18243A]"><X size={18} /></button>
              )}
            </div>

            {/* ── Post-offboard result ── */}
            {offboardResult ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-emerald-800">Offboarding complete</p>
                    <p className="text-xs text-emerald-700 mt-0.5">{offboardResult.details}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Sessions Invalidated", value: "All", icon: LogOut, color: "text-red-600 bg-red-50" },
                    { label: "Permissions Revoked", value: offboardResult.revoked_permissions_count, icon: XCircle, color: "text-amber-600 bg-amber-50" },
                    { label: "Docs Transferred", value: offboardResult.transferred_documents_count, icon: ArrowRightLeft, color: "text-blue-600 bg-blue-50" },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center p-3 bg-[#F9FAFC] rounded-xl border border-[#E5EAF2]">
                      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg mb-1.5 ${stat.color}`}>
                        <stat.icon size={15} />
                      </div>
                      <p className="text-base font-bold text-[#18243A]">{stat.value}</p>
                      <p className="text-[10px] text-[#6B778C]">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> Revocation does not erase content that was already downloaded, copied, photographed, or otherwise saved outside TrustVault. The full offboarding event has been recorded in the Audit Trail.
                  </p>
                </div>
                <button onClick={() => { setOffboardUser(null); setOffboardResult(null); }} className="btn btn-primary w-full justify-center">
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* User info */}
                <div className="flex items-center gap-3 p-3 bg-[#F6F8FC] rounded-xl border border-[#E5EAF2]">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-sm uppercase">
                    {offboardUser.full_name?.charAt(0) || "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#18243A] text-sm truncate">{offboardUser.full_name}</p>
                    <p className="text-xs text-[#6B778C] truncate">{offboardUser.email}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_COLORS[offboardUser.role] || ""}`}>
                    {offboardUser.role?.toUpperCase()}
                  </span>
                </div>

                {/* Warning */}
                <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <p className="font-bold mb-0.5">This action will immediately:</p>
                    <ul className="space-y-0.5 list-disc list-inside text-amber-700">
                      <li>Deactivate the account (cannot log in)</li>
                      <li>Invalidate all active sessions and tokens</li>
                      <li>Revoke all active document permissions (Viewer &amp; Editor)</li>
                      <li>Transfer document ownership if specified</li>
                    </ul>
                  </div>
                </div>

                {/* Summary */}
                {offboardSummaryLoading ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-[#6B778C] text-xs">
                    <span className="spinner" style={{ width: 16, height: 16 }} />
                    Loading offboard summary...
                  </div>
                ) : offboardSummary ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-[#F9FAFC] rounded-lg border border-[#E5EAF2] text-center">
                      <FileText size={16} className="text-blue-500 mx-auto mb-1" />
                      <p className="text-xl font-bold text-[#18243A]">{offboardSummary.owned_documents_count}</p>
                      <p className="text-[11px] text-[#6B778C]">Owned Documents</p>
                    </div>
                    <div className="p-3 bg-[#F9FAFC] rounded-lg border border-[#E5EAF2] text-center">
                      <Shield size={16} className="text-amber-500 mx-auto mb-1" />
                      <p className="text-xl font-bold text-[#18243A]">{offboardSummary.active_permissions_count}</p>
                      <p className="text-[11px] text-[#6B778C]">Active Permissions to Revoke</p>
                    </div>
                  </div>
                ) : null}

                {/* Document ownership transfer */}
                {offboardSummary && offboardSummary.owned_documents_count > 0 && (
                  <div className="space-y-2">
                    <label className="label flex items-center gap-1.5">
                      <ArrowRightLeft size={14} className="text-[#3478F6]" />
                      Transfer {offboardSummary.owned_documents_count} document{offboardSummary.owned_documents_count !== 1 ? "s" : ""} to
                      <span className="text-red-600 ml-0.5">*required</span>
                    </label>
                    <select
                      className="input select"
                      value={selectedNewOwner}
                      onChange={(e) => setSelectedNewOwner(e.target.value)}
                      required
                    >
                      <option value="">— Select a new owner —</option>
                      {offboardSummary.potential_owners?.map((o: any) => (
                        <option key={o.id} value={o.id}>
                          {o.full_name} ({o.email}) — {o.role}
                        </option>
                      ))}
                    </select>
                    {offboardSummary.owned_documents?.length > 0 && (
                      <div className="max-h-24 overflow-y-auto space-y-1 p-2 bg-[#F6F8FC] rounded-lg border border-[#E5EAF2]">
                        {offboardSummary.owned_documents.map((d: any) => (
                          <div key={d.id} className="text-xs text-[#475569] flex items-center gap-1.5">
                            <FileText size={11} className="text-[#3478F6]" />
                            <span className="truncate">{d.title}</span>
                            <span className="text-[10px] text-[#6B778C] shrink-0">[{d.category}]</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Reason */}
                <div>
                  <label className="label">Offboarding reason (audited)</label>
                  <input
                    className="input"
                    value={offboardReason}
                    onChange={(e) => setOffboardReason(e.target.value)}
                    placeholder="e.g. Voluntary resignation, contract ended..."
                  />
                </div>

                {/* Cache / data caveat */}
                <div className="flex items-start gap-2 p-3 bg-[#F0F5FF] border border-blue-200 rounded-lg">
                  <Info size={13} className="text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-700">
                    Access revocation prevents future access through TrustVault. It cannot undo files the user already downloaded, copied, or saved externally. Document metadata and historical audit records are preserved for investigative purposes.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2 border-t border-[#E5EAF2]">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setOffboardUser(null); setOffboardResult(null); }}
                    disabled={offboarding}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmOffboard}
                    disabled={offboarding || offboardSummaryLoading}
                    className="btn btn-danger btn-sm flex items-center gap-1.5"
                  >
                    {offboarding ? (
                      <span className="spinner" style={{ width: 14, height: 14 }} />
                    ) : (
                      <UserMinus size={14} />
                    )}
                    {offboarding ? "Processing…" : "Confirm Offboarding"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#3478F6] uppercase tracking-wider mb-1">
            <Users size={14} /> Administration
          </div>
          <h1 className="text-2xl font-bold text-[#18243A] tracking-tight">User Management</h1>
          <p className="text-[#6B778C] text-sm mt-0.5">
            Manage organization members, assign roles, and perform secure employee offboarding.
          </p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary self-start md:self-auto shadow-sm">
          <UserPlus size={16} /> Add Member
        </button>
      </div>

      {/* ── Stats ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Users", value: users.length, icon: Users, color: "bg-blue-50 text-[#3478F6]" },
          { label: "Active", value: activeCount, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
          { label: "Suspended", value: inactiveCount, icon: XCircle, color: "bg-red-50 text-red-500" },
          { label: "Admins & Owners", value: adminCount + ownerCount, icon: Shield, color: "bg-purple-50 text-purple-600" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon ${s.color}`}>
              <s.icon size={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-[#6B778C] uppercase">{s.label}</p>
              <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">{s.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter & Search ───────────────────────────────────── */}
      <div className="card p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B778C] pointer-events-none" />
          <input
            className="input input-with-icon"
            placeholder="Search by user name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadUsers()}
          />
        </div>
        <select className="input select w-auto text-xs" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        <button onClick={loadUsers} className="btn btn-secondary text-xs btn-sm">Search</button>
      </div>

      {/* ── Users Table ───────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <p className="text-xs text-[#6B778C]">Loading user directory...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state py-16">
            <Users size={48} className="mx-auto mb-3 opacity-30 text-[#3478F6]" />
            <h3 className="text-base font-semibold text-[#18243A]">No users found</h3>
            <p className="text-sm text-[#6B778C] mt-1 max-w-sm mx-auto">No registered user profiles matched your current search filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User Profile</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created Date</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const roleStyle = ROLE_COLORS[u.role] || "bg-gray-100 text-gray-700 border-gray-200";
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className={`hover:bg-[#F9FAFC] transition-colors ${!u.is_active ? "opacity-60" : ""}`}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs uppercase shrink-0 ${
                            u.is_active ? "bg-[#1B2A47] text-white" : "bg-gray-200 text-gray-500"
                          }`}>
                            {u.full_name?.charAt(0) || "U"}
                          </div>
                          <div>
                            <span className="font-semibold text-[#18243A] text-sm block">
                              {u.full_name}
                              {isSelf && (
                                <span className="ml-2 text-[10px] bg-blue-100 text-[#3478F6] px-1.5 py-0.5 rounded font-bold">YOU</span>
                              )}
                            </span>
                            <span className="text-xs text-[#6B778C]">{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${roleStyle}`}>
                          <Shield size={12} />
                          {u.role?.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {u.is_active ? (
                          <span className="badge badge-green"><CheckCircle2 size={12} /> Active</span>
                        ) : (
                          <div>
                            <span className="badge badge-red"><XCircle size={12} /> Suspended</span>
                            {u.deactivated_at && (
                              <p className="text-[10px] text-[#6B778C] mt-0.5">
                                <Clock size={10} className="inline mr-0.5" />
                                {format(new Date(u.deactivated_at), "MMM d, yyyy HH:mm")}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="text-xs text-[#6B778C]">
                        {u.created_at ? format(new Date(u.created_at), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditModal(u)} className="btn btn-ghost p-1.5 rounded-lg hover:text-[#3478F6]" title="Edit Role & Status">
                            <Edit2 size={15} />
                          </button>

                          {!isSelf && u.is_active && (
                            <button
                              onClick={() => openOffboardModal(u)}
                              className="btn btn-sm text-xs text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 flex items-center gap-1"
                              title="Offboard Employee"
                            >
                              <UserMinus size={13} /> Offboard
                            </button>
                          )}

                          {!isSelf && !u.is_active && (
                            <button
                              onClick={() => handleToggleActive(u)}
                              className="btn btn-sm text-xs text-emerald-600 hover:bg-emerald-50 border border-emerald-200 bg-emerald-50/40"
                            >
                              Reactivate
                            </button>
                          )}
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

      {/* ── Offboarding Info Banner ───────────────────────────── */}
      <div className="mt-6 p-4 bg-[#FEF9EC] border border-amber-200 rounded-xl flex items-start gap-3">
        <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800">
          <p className="font-semibold mb-0.5">Employee Offboarding Security Notice</p>
          <p>
            The <strong>Offboard</strong> action deactivates the account, immediately invalidates all active sessions (including existing JWTs), revokes all document permissions, and transfers document ownership. All actions are recorded in the tamper-evident Audit Trail. Offboarding cannot undo data the employee already saved externally.
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
