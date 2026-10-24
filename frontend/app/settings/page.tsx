"use client";
import React, { useState } from "react";
import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";
import { useAuth } from "@/lib/auth-context";
import { profileApi, usersApi } from "@/lib/api";
import {
  Settings, User, Shield, Key, Database, Bell,
  CheckCircle2, Copy, Check, LogOut, Lock, Server, Cpu,
  Eye, EyeOff, Loader2, AlertCircle, Upload, ArrowLeft, Info
} from "lucide-react";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [copiedToken, setCopiedToken] = useState(false);

  // Profile fields state
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Avatar upload state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [avatarTimestamp, setAvatarTimestamp] = useState<number>(Date.now());
  const [avatarError, setAvatarError] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("trustvault_token") : null;

  const copyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    if (!user) return;
    try {
      setProfileSaving(true);
      await usersApi.update(user.id, { full_name: fullName.trim() });
      setProfileMsg({ text: "Profile details updated successfully.", type: "success" });
    } catch (err: any) {
      setProfileMsg({ text: err.message || "Failed to update profile.", type: "error" });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile) {
      setAvatarMsg({ text: "Please select an image file first.", type: "error" });
      return;
    }
    setAvatarMsg(null);
    setAvatarUploading(true);
    try {
      await profileApi.uploadAvatar(avatarFile);
      setAvatarMsg({ text: "Profile picture uploaded successfully.", type: "success" });
      setAvatarFile(null);
      setAvatarError(false);
      const newTimestamp = Date.now();
      setAvatarTimestamp(newTimestamp);
      if (typeof window !== "undefined") {
        localStorage.setItem("trustvault_avatar_updated", String(newTimestamp));
        window.dispatchEvent(new Event("trustvault_avatar_updated"));
      }
    } catch (err: any) {
      setAvatarMsg({ text: err.message || "Failed to upload picture.", type: "error" });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError("All password fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }

    setPwLoading(true);
    try {
      const res: any = await profileApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
        confirm_new_password: confirmPassword,
      });
      setPwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (res?.access_token) {
        localStorage.setItem("trustvault_token", res.access_token);
      }
    } catch (err: any) {
      setPwError(err.message || "Password change failed. Please verify your current password.");
    } finally {
      setPwLoading(false);
    }
  };

  const PERMISSION_MATRIX = [
    { name: "View Own Documents", roles: ["admin", "owner", "editor", "viewer"] },
    { name: "Upload New Documents", roles: ["admin", "owner"] },
    { name: "Download Authorized Files", roles: ["admin", "owner", "editor", "viewer"] },
    { name: "Edit Document Metadata", roles: ["admin", "owner", "editor"] },
    { name: "Grant / Revoke Permissions", roles: ["admin", "owner"] },
    { name: "Delete Owned Documents", roles: ["admin", "owner"] },
    { name: "Inspect Global Audit Trail", roles: ["admin"] },
    { name: "Verify SHA-256 Hash Chain", roles: ["admin"] },
    { name: "Manage User Accounts", roles: ["admin"] },
  ];

  return (
    <AuthLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#3478F6] uppercase tracking-wider mb-1">
            <Settings size={14} /> Profile &amp; Settings
          </div>
          <h1 className="text-2xl font-bold text-[#18243A] tracking-tight">Account Configuration</h1>
          <p className="text-[#6B778C] text-sm mt-0.5">
            Manage your personal profile, credentials, and review organizational permissions.
          </p>
        </div>

        {/* 2-Column Layout Matching Reference (Image 3) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Avatar & Account Info */}
          <div className="lg:col-span-4 space-y-6">
            {/* Profile Picture Card */}
            <div className="card p-6 text-center space-y-4">
              <div className="relative inline-block mx-auto">
                <div className="w-24 h-24 rounded-full bg-[#101B32] text-white flex items-center justify-center font-bold text-3xl uppercase ring-4 ring-[#3478F6]/20 shadow-lg mx-auto overflow-hidden">
                  {!avatarError && user?.id ? (
                    <img
                      src={`/api/v1/users/${user.id}/avatar?t=${avatarTimestamp}`}
                      alt={user.full_name || "Profile"}
                      className="w-full h-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <span>{user?.full_name?.charAt(0) || "U"}</span>
                  )}
                </div>
                <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white ring-1 ring-emerald-300" title="Active session" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-[#18243A]">{user?.full_name}</h2>
                <p className="text-xs text-[#6B778C] capitalize mt-0.5">{user?.role} Account</p>
                <p className="text-xs font-mono text-[#9AA5B8] mt-1 truncate">{user?.email}</p>
              </div>

              {/* Choose a Picture */}
              <div className="pt-4 border-t border-[#E5EAF2] text-left space-y-3">
                <label className="text-xs font-semibold text-[#18243A] block">
                  Choose a Picture
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                  className="input text-xs py-1.5 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-[#3478F6] hover:file:bg-blue-100 cursor-pointer"
                />
                <p className="text-[11px] text-[#6B778C]">
                  Accepted formats: PNG, JPG, JPEG and WEBP. Maximum size: 5 MB.
                </p>

                {avatarMsg && (
                  <p className={`text-xs ${avatarMsg.type === "success" ? "text-emerald-600 font-medium" : "text-red-600"}`}>
                    {avatarMsg.text}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleAvatarUpload}
                  disabled={avatarUploading || !avatarFile}
                  className="btn btn-primary w-full text-xs justify-center py-2"
                >
                  {avatarUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  Upload Picture
                </button>
              </div>

              {/* Account Information Box */}
              <div className="pt-4 border-t border-[#E5EAF2] text-left space-y-2.5">
                <h3 className="text-xs font-bold text-[#18243A] uppercase tracking-wider">Account Information</h3>
                <div className="bg-[#F6F8FC] p-3 rounded-lg border border-[#E5EAF2] space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#6B778C]">Account ID</span>
                    <span className="font-mono text-[#18243A] text-[11px] truncate max-w-[140px]">{user?.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B778C]">Role</span>
                    <span className="badge badge-blue text-[10px] uppercase">{user?.role}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B778C]">Status</span>
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={12} /> Active
                    </span>
                  </div>
                </div>

                <button
                  onClick={logout}
                  className="btn btn-secondary text-red-600 hover:bg-red-50 text-xs w-full justify-center py-2 mt-2"
                >
                  <LogOut size={13} /> Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Profile Edit & Change Password */}
          <div className="lg:col-span-8 space-y-6">
            {/* Account Details Form */}
            <div className="card p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[#E5EAF2]">
                <User size={18} className="text-[#3478F6]" />
                <h3 className="font-bold text-[#18243A] text-base">Account Details</h3>
              </div>

              {profileMsg && (
                <div className={`p-3 rounded-lg text-xs font-medium ${profileMsg.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {profileMsg.text}
                </div>
              )}

              <form onSubmit={handleProfileSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#18243A] block">Username / Full Name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="input text-sm h-10"
                      placeholder="Your full name"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#18243A] block">Email Address</label>
                    <input
                      type="email"
                      value={user?.email || ""}
                      disabled
                      className="input text-sm h-10 bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="btn btn-primary text-xs px-4 py-2"
                  >
                    {profileSaving ? <Loader2 size={13} className="animate-spin" /> : "Save Changes"}
                  </button>
                  <Link href="/documents" className="btn btn-secondary text-xs px-4 py-2">
                    Back to Documents
                  </Link>
                </div>
              </form>
            </div>

            {/* Change Password Card - Matching Reference (Image 3) */}
            <div className="card p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[#E5EAF2]">
                <Key size={18} className="text-[#3478F6]" />
                <div>
                  <h3 className="font-bold text-[#18243A] text-base">Change Password</h3>
                  <p className="text-xs text-[#6B778C]">Update your password to keep your account secure.</p>
                </div>
              </div>

              {/* Security Tip Box from Reference */}
              <div className="flex items-start gap-2.5 p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl">
                <Info size={16} className="text-[#3478F6] shrink-0 mt-0.5" />
                <p className="text-xs text-[#1E3A8A] leading-relaxed">
                  <strong className="font-semibold">Security tip:</strong> Use a strong password with at least 8 to 12 characters. Avoid reusing passwords from other accounts.
                </p>
              </div>

              {pwSuccess && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-[#3478F6] font-medium">
                  <CheckCircle2 size={16} />
                  Password changed successfully. Redirecting to login…
                </div>
              )}

              {pwError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle size={16} />
                  {pwError}
                </div>
              )}

              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-3">
                  {/* Current Password */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#18243A]">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrent ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="input pr-10 text-sm h-10"
                        placeholder="Current password"
                        autoComplete="current-password"
                        disabled={pwLoading || pwSuccess}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrent(!showCurrent)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9AA5B8] hover:text-[#6B778C]"
                        tabIndex={-1}
                      >
                        {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#18243A]">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showNew ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="input pr-10 text-sm h-10"
                        placeholder="Min 8 characters"
                        autoComplete="new-password"
                        disabled={pwLoading || pwSuccess}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9AA5B8] hover:text-[#6B778C]"
                        tabIndex={-1}
                      >
                        {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#18243A]">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirm ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`input pr-10 text-sm h-10 ${
                          confirmPassword && confirmPassword !== newPassword
                            ? "border-red-400 bg-red-50"
                            : confirmPassword && confirmPassword === newPassword
                            ? "border-[#3478F6] bg-blue-50"
                            : ""
                        }`}
                        placeholder="Repeat new password"
                        autoComplete="new-password"
                        disabled={pwLoading || pwSuccess}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9AA5B8] hover:text-[#6B778C]"
                        tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {confirmPassword && confirmPassword !== newPassword && (
                      <p className="text-xs text-red-600">Passwords do not match</p>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="btn btn-primary text-xs px-5 py-2.5 inline-flex items-center gap-2"
                    disabled={pwLoading || pwSuccess}
                  >
                    {pwLoading ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                    Update Password
                  </button>
                </div>
              </form>
            </div>

            {/* Active Authorization Token Card */}
            <div className="card p-6 space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-[#E5EAF2]">
                <Key size={18} className="text-[#3478F6]" />
                <h3 className="font-bold text-[#18243A] text-base">Active Authorization Token</h3>
              </div>
              <p className="text-xs text-[#6B778C]">
                Cryptographically signed JSON Web Token (JWT) authorizing API requests with automatic expiry and tamper prevention.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#F6F8FC] border border-[#E5EAF2] p-2.5 rounded-lg font-mono text-xs text-[#475569] truncate select-all">
                  {token ? `${token.slice(0, 32)}••••••••••••••••••••••••••••${token.slice(-16)}` : "No active token"}
                </div>
                <button
                  onClick={copyToken}
                  className="btn btn-secondary text-xs shrink-0 py-2 px-3"
                  disabled={!token}
                >
                  {copiedToken ? <Check size={14} className="text-[#3478F6]" /> : <Copy size={14} />}
                  {copiedToken ? "Copied" : "Copy Token"}
                </button>
              </div>
            </div>

            {/* Permissions Matrix */}
            <div className="card p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[#E5EAF2]">
                <Shield size={18} className="text-[#3478F6]" />
                <h3 className="font-bold text-[#18243A] text-base">Role-Based Access Policy Matrix</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="data-table text-xs">
                  <thead>
                    <tr>
                      <th>Privilege / Capability</th>
                      <th className="text-center">Admin</th>
                      <th className="text-center">Owner</th>
                      <th className="text-center">Editor</th>
                      <th className="text-center">Viewer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSION_MATRIX.map((item, idx) => (
                      <tr key={idx} className="hover:bg-[#FAFBFD]">
                        <td className="font-medium text-[#18243A]">{item.name}</td>
                        {(["admin", "owner", "editor", "viewer"] as const).map((r) => {
                          const hasPerm = item.roles.includes(r);
                          const isCurrent = user?.role === r;

                          return (
                            <td key={r} className={`text-center ${isCurrent ? "bg-blue-50/40" : ""}`}>
                              {hasPerm ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-[#3478F6] font-bold text-xs">
                                  ✓
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-5 h-5 text-gray-300 font-bold">
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
