"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Lock, Eye, EyeOff, AlertCircle, CheckCircle2,
  UserPlus, ArrowLeft, Shield, Users, FileCheck2
} from "lucide-react";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user, login } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (user) router.push("/documents");
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const name = fullName.trim();
    const mail = email.trim().toLowerCase();

    if (!name) { setError("Please provide your full name."); return; }
    if (!mail || !mail.includes("@") || !mail.includes(".")) { setError("Please provide a valid email address."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters long."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match. Please re-enter."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name, email: mail, password, confirm_password: confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Registration failed. Please verify your details.");

      setSuccess("Account created successfully! Signing you in...");
      try {
        await login(mail, password);
        router.push("/documents");
      } catch {
        setTimeout(() => router.push("/login"), 1500);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#F4F7FC" }}>
      {/* Left panel — matches login page blue theme exactly */}
      <div className="hidden lg:flex flex-col justify-between w-[460px] bg-[#0E1A30] p-12 shrink-0 border-r border-[#1B2A4A] relative overflow-hidden">
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
            Create your account,<br />
            <span className="text-[#60A5FA]">safely share</span><br />
            with confidence.
          </h2>
          <p className="text-blue-200/80 text-sm leading-relaxed mb-8">
            Every new account is isolated with fine-grained access delegation and tamper-evident audit logging from day one.
          </p>

          <div className="space-y-4">
            {[
              { icon: Shield,    title: "Zero-Trust Data Isolation",   desc: "Your documents remain strictly private until explicitly shared." },
              { icon: Users,     title: "Granular Role Assignment",     desc: "Safe default privileges prevent privilege escalation." },
              { icon: FileCheck2,title: "Cryptographic Accountability", desc: "All uploads and permissions are hashed to the audit ledger." },
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
            Security Enforced
          </span>
        </div>
      </div>

      {/* Right panel — registration form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 overflow-y-auto">
        <div className="w-full max-w-[440px]">

          {/* Mobile Header */}
          <div className="flex items-center gap-3 mb-6 lg:hidden">
            <div className="w-9 h-9 bg-[#3478F6] rounded-xl flex items-center justify-center text-white">
              <Lock size={16} />
            </div>
            <span className="font-bold text-xl text-[#101B32]">TrustVault</span>
          </div>

          {/* Back link */}
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B778C] hover:text-[#18243A] mb-6 transition-colors"
          >
            <ArrowLeft size={14} /> Back to Sign In
          </Link>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#18243A] tracking-tight">Create Account</h1>
            <p className="text-[#6B778C] text-xs mt-1">
              Register for TrustVault to upload, secure, and manage confidential documents.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-3.5 mb-5 bg-red-50 border border-red-200 rounded-xl text-red-700 animate-fadeIn">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
              <div className="text-xs">
                <p className="font-semibold">Registration Error</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-start gap-3 p-3.5 mb-5 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 animate-fadeIn">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-blue-600" />
              <div className="text-xs">
                <p className="font-semibold">Account Created</p>
                <p className="mt-0.5">{success}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="fullName">Full Name</label>
              <input
                id="fullName" type="text" autoComplete="name" required
                value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="input" placeholder="Jane Doe"
              />
            </div>

            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="input" placeholder="jane.doe@company.com"
              />
            </div>

            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password" type={showPassword ? "text" : "password"}
                  autoComplete="new-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10" placeholder="At least 8 characters"
                />
                <button
                  type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B778C] hover:text-[#18243A] transition-colors p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="text-[11px] text-[#6B778C] mt-1">Must be at least 8 characters.</p>
            </div>

            <div>
              <label className="label" htmlFor="confirmPassword">Confirm Password</label>
              <div className="relative">
                <input
                  id="confirmPassword" type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password" required
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input pr-10" placeholder="Re-enter password"
                />
                <button
                  type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B778C] hover:text-[#18243A] transition-colors p-1"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="btn btn-primary w-full justify-center py-2.5 text-sm font-semibold shadow-sm mt-3"
            >
              {loading ? (
                <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              ) : (
                <UserPlus size={16} />
              )}
              {loading ? "Creating Account…" : "Register Account"}
            </button>

            <div className="mt-4 pt-4 border-t border-[#E5EAF2] text-center">
              <p className="text-[12px] text-[#6B778C]">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-[#3478F6] hover:text-[#2563EB] hover:underline">
                  Sign in here
                </Link>
              </p>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
