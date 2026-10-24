"use client";
import React from "react";
import Link from "next/link";

interface AccessDeniedProps {
  title?: string;
  message?: string;
  backHref?: string;
  backLabel?: string;
}

export default function AccessDenied({
  title = "Access Denied",
  message = "You don't have permission to access this resource. If you believe this is a mistake, contact the document owner or administrator.",
  backHref = "/documents",
  backLabel = "Back to Documents",
}: AccessDeniedProps) {
  return (
    <div className="py-12 px-2 max-w-2xl">
      <div className="text-xs font-mono font-bold text-[#3478F6] tracking-wider mb-0.5">
        403
      </div>
      <div className="text-xs font-bold text-[#3478F6] uppercase tracking-wider mb-3">
        SECURITY CHECK
      </div>
      <h1 className="text-3xl font-bold text-[#18243A] tracking-tight mb-4">
        {title}
      </h1>
      <p className="text-sm text-[#6B778C] mb-6 leading-relaxed">
        {message}
      </p>
      <Link
        href={backHref}
        className="text-[#3478F6] hover:underline text-sm font-medium inline-flex items-center gap-1"
      >
        &larr; {backLabel}
      </Link>
    </div>
  );
}

