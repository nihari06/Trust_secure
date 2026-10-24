"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Lock, Eye, EyeOff, AlertCircle,
  LogIn, Shield, Users, FileCheck2, UserCheck, Sparkles, UserPlus
} from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (user) router.push("/documents");
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);

    try {
      await login(email.trim().toLowerCase(), password);
      router.push("/documents");
    } catch (err: any) {
      let msg = err.message || "Login failed. Please check your credentials.";
      if (msg.includes("Failed to fetch") || msg.includes("Unable to connect")) {
        msg = "Unable to connect to TrustVault server. Please verify the backend service is running on port 8000.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const selectDemoAccount = (acc: { email: string; pass: string; role: string }) => {
    setEmail(acc.email);
    setPassword(acc.pass);
    setError(null);
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#F4F7FC" }}>
      {/* Left panel - Brand & Security Highlights */}
      <div className="hidden lg:flex flex-col justify-between w-[460px] bg-[#0E1A30] p-12 shrink-0 border-r border-[#1B2A4A] relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-[#3478F6]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-[#2563EB]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#3478F6] rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Lock size={18} className="text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-xl tracking-tight">TrustVault</span>
              <span className="ml-2 text-[10px] font-semibold text-blue-300 bg-blue-900/60 px-2 py-0.5 rounded-full border border-blue-700/50">
                v2.0 Secure
              </span>
            </div>
          </div>
        </div>

        <div className="relative z-10 my-auto py-12">
          <h2 className="text-white text-3xl font-extrabold leading-tight mb-4 tracking-tight">
            Confidential documents,<br />
            <span className="text-[#60A5FA]">strictly enforced</span><br />
            access control.
          </h2>
          <p className="text-blue-200/80 text-sm leading-relaxed mb-8">
            Zero-trust document protection with real-time server authorization, instant employee offboarding, and tamper-evident SHA-256 audit ledgers.
          </p>

          {/* Feature list */}
          <div className="space-y-4">
            {[
              {
                icon: Shield,
                title: "Live Request Authorization",
                desc: "Every download, preview, and update validated on live database.",
              },
              {
                icon: UserCheck,
                title: "Instant Access Revocation",
                desc: "Employee offboarding invalidates all active sessions immediately.",
              },
              {
                icon: Users,
                title: "Independent Multi-Recipient Sharing",
                desc: "Granular Viewer and Editor roles per recipient.",
              },
              {
                icon: FileCheck2,
                title: "Tamper-Evident SHA-256 Audit Trail",
                desc: "Immutable cryptographic event chaining on all actions.",
              },
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3.5 text-left">
                <div className="w-8 h-8 rounded-lg bg-blue-900/40 border border-blue-700/40 flex items-center justify-center shrink-0 mt-0.5 text-blue-400">
                  <f.icon size={15} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">{f.title}</p>
                  <p className="text-[11px] text-blue-300/70">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 pt-6 border-t border-blue-950 flex items-center justify-between text-blue-400 text-xs">
          <span>TrustVault Platform</span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Auth System Online
          </span>
        </div>
      </div>

      {/* Right panel - Auth form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 overflow-y-auto">
        <div className="w-full max-w-[440px]">
          {/* Mobile Header */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-[#3478F6] rounded-xl flex items-center justify-center text-white">
              <Lock size={16} />
            </div>
            <span className="font-bold text-xl text-[#101B32]">TrustVault</span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#18243A] tracking-tight">
              Welcome back
            </h1>
            <p className="text-[#6B778C] text-xs mt-1">
              Sign in with your corporate credentials to access your protected documents.
            </p>
          </div>

          {/* Feedback alerts */}
          {error && (
            <div className="flex items-start gap-3 p-3.5 mb-5 bg-red-50 border border-red-200 rounded-xl text-red-700 animate-fadeIn">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
              <div className="text-xs">
                <p className="font-semibold">Authentication Error</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="name@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label !mb-0" htmlFor="password">Password</label>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="••••••••"
                />
                {password.length > 0 && password.length < 8 && (
                  <p className="text-[11px] text-red-500 mt-1 absolute -bottom-5 left-0">Must be at least 8 characters.</p>
                )}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B778C] hover:text-[#18243A] transition-colors p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full justify-center py-2.5 text-sm font-semibold shadow-sm mt-3"
            >
              {loading ? (
                <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              ) : (
                <LogIn size={16} />
              )}
              {loading ? "Authenticating…" : "Sign In"}
            </button>

            {/* NEW: Register / Create Account link — Company Requirement */}
            <div className="mt-4 pt-4 border-t border-[#E5EAF2] text-center">
              <p className="text-[12px] text-[#6B778C]">
                Don&apos;t have an account?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-[#3478F6] hover:text-[#2563EB] hover:underline inline-flex items-center gap-1"
                >
                  <UserPlus size={13} />
                  Register / Create Account
                </Link>
              </p>
            </div>
          </form>

          {/* Hackathon Evaluation Demo Accounts */}
          <div className="mt-6 p-4 bg-white border border-[#E5EAF2] rounded-xl shadow-2xs">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[11px] font-bold text-[#18243A] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#3478F6]" /> Demo Credentials (Click to Auto-fill)
              </p>
              <span className="text-[10px] text-[#6B778C]">Authenticates via API</span>
            </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {[
                  { email: "admin@trustvault.dev", pass: "Admin1234!", role: "Admin", desc: "Audit & User Mgmt" },
                  { email: "owner_a@trustvault.dev", pass: "Owner1234!", role: "Owner A", desc: "Owns 4 Docs" },
                  { email: "viewer@trustvault.dev", pass: "Viewer1234!", role: "Viewer B", desc: "Shared on Q4 Doc" },
                  { email: "editor@trustvault.dev", pass: "Editor1234!", role: "Editor D", desc: "Shared on NDA Doc" },
                ].map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => selectDemoAccount(acc)}
                    className={`text-left p-2 rounded-lg border transition-all text-xs ${
                      email === acc.email
                        ? "bg-blue-50 border-[#3478F6] text-[#2563EB]"
                        : "bg-[#F9FAFC] border-[#E5EAF2] hover:bg-gray-100 text-[#18243A]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px]">[{acc.role}]</span>
                      <span className="text-[10px] text-[#6B778C]">{acc.desc}</span>
                    </div>
                    <p className="text-[11px] text-[#475569] truncate mt-0.5">{acc.email}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
