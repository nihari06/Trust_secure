"use client";
import React, { useState, useEffect } from "react";
import AuthLayout from "@/components/AuthLayout";
import AccessDenied from "@/components/AccessDenied";
import { useAuth } from "@/lib/auth-context";
import { auditApi } from "@/lib/api";
import {
  ClipboardList, ShieldCheck, ShieldAlert, CheckCircle2,
  XCircle, Search, RefreshCw, Copy, Check, Filter,
  Lock, ArrowRight, Eye, X, Activity
} from "lucide-react";
import { format } from "date-fns";

const OUTCOME_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  success: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "text-emerald-700", icon: CheckCircle2 },
  allowed: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "text-emerald-700", icon: CheckCircle2 },
  failure: { bg: "bg-red-50 text-red-700 border-red-200", text: "text-red-700", icon: XCircle },
  denied: { bg: "bg-red-50 text-red-700 border-red-200", text: "text-red-700", icon: ShieldAlert },
};

export default function AuditTrailPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [actionsList, setActionsList] = useState<string[]>([]);
  const [auditStats, setAuditStats] = useState<any | null>(null);
  const [suspiciousReport, setSuspiciousReport] = useState<any | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    checked: number;
    errors?: string[];
    failed_event_ids?: string[];
    summary?: string;
  } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const loadEvents = async () => {
    try {
      setLoading(true);
      if (isAdmin) {
        const [evList, actions, stats, susp] = await Promise.all([
          auditApi.list({
            search: search.trim() || undefined,
            actor: userFilter.trim() || undefined,
            action: actionFilter !== "all" ? actionFilter : undefined,
            outcome: outcomeFilter !== "all" ? outcomeFilter : undefined,
            from_date: fromDate ? `${fromDate}T00:00:00` : undefined,
            to_date: toDate ? `${toDate}T23:59:59` : undefined,
            page_size: 100,
          }),
          auditApi.actions().catch(() => []),
          auditApi.stats().catch(() => null),
          auditApi.suspicious(3).catch(() => null),
        ]);
        setEvents(evList || []);
        if (actions && Array.isArray(actions)) setActionsList(actions);
        if (stats) setAuditStats(stats);
        if (susp) setSuspiciousReport(susp);
      } else {
        const myEvents = await auditApi.my({ page_size: 100 });
        setEvents(myEvents || []);
      }
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [isAdmin, actionFilter, outcomeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadEvents();
  };

  const handleVerifyChain = async () => {
    if (!isAdmin) return;
    try {
      setVerifying(true);
      const res = await auditApi.verify();
      setVerifyResult(res);
    } catch {
      setVerifyResult({ valid: false, checked: 0, errors: ["Verification request failed."] });
    } finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  if (!isAdmin) {
    return (
      <AuthLayout>
        <AccessDenied
          title="Access Denied"
          message="You don't have permission to access this resource. If you believe this is a mistake, contact the document owner or administrator."
          backHref="/documents"
          backLabel="Back to Documents"
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {/* Event Details Dialog */}
      {selectedEvent && (
        <div className="dialog-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="dialog" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAF2] mb-4">
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-[#3478F6]" />
                <h3 className="font-bold text-[#18243A] text-base">
                  Audit Block #{selectedEvent.sequence_num}
                </h3>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="text-[#6B778C] hover:text-[#18243A]">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-[#F6F8FC] p-3 rounded-xl border border-[#E5EAF2]">
                <div>
                  <span className="text-[#6B778C] font-semibold block uppercase tracking-wider text-[10px]">Action</span>
                  <span className="font-bold text-[#18243A] text-sm">{selectedEvent.action}</span>
                </div>
                <div>
                  <span className="text-[#6B778C] font-semibold block uppercase tracking-wider text-[10px]">Outcome</span>
                  <span className={`inline-flex items-center gap-1 font-bold text-xs mt-0.5 ${
                    selectedEvent.outcome === "success" || selectedEvent.outcome === "allowed"
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}>
                    {selectedEvent.outcome.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-[#6B778C] font-semibold block uppercase tracking-wider text-[10px]">Actor</span>
                  <span className="text-[#18243A] font-medium">{selectedEvent.actor_email || "System"}</span>
                </div>
                <div>
                  <span className="text-[#6B778C] font-semibold block uppercase tracking-wider text-[10px]">Timestamp (UTC)</span>
                  <span className="text-[#18243A] font-medium">
                    {format(new Date(selectedEvent.timestamp), "MMM d, yyyy HH:mm:ss")}
                  </span>
                </div>
                {selectedEvent.ip_address && (
                  <div>
                    <span className="text-[#6B778C] font-semibold block uppercase tracking-wider text-[10px]">IP Address</span>
                    <span className="font-mono text-[#18243A]">{selectedEvent.ip_address}</span>
                  </div>
                )}
                {selectedEvent.resource_name && (
                  <div>
                    <span className="text-[#6B778C] font-semibold block uppercase tracking-wider text-[10px]">Target Resource</span>
                    <span className="text-[#18243A] font-medium truncate block">{selectedEvent.resource_name}</span>
                  </div>
                )}
                {selectedEvent.request_id && (
                  <div className="col-span-2">
                    <span className="text-[#6B778C] font-semibold block uppercase tracking-wider text-[10px]">Request ID</span>
                    <span className="font-mono text-[#18243A] block truncate">{selectedEvent.request_id}</span>
                  </div>
                )}
              </div>

              {/* Cryptographic Linkage */}
              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-[#18243A] flex items-center gap-1.5 text-xs">
                      <Lock size={12} className="text-[#3478F6]" /> SHA-256 Event Hash
                    </span>
                    <button
                      onClick={() => copyToClipboard(selectedEvent.event_hash, "event_hash")}
                      className="text-xs text-[#3478F6] hover:underline flex items-center gap-1"
                    >
                      {copiedHash === "event_hash" ? <Check size={12} /> : <Copy size={12} />}
                      {copiedHash === "event_hash" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="p-2.5 bg-[#1B2A47] text-blue-200 font-mono text-[11px] rounded-lg break-all">
                    {selectedEvent.event_hash}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-[#18243A] flex items-center gap-1.5 text-xs">
                      <ArrowRight size={12} className="text-[#6B778C]" /> Previous Hash (Parent Link)
                    </span>
                    {selectedEvent.prev_hash && (
                      <button
                        onClick={() => copyToClipboard(selectedEvent.prev_hash, "prev_hash")}
                        className="text-xs text-[#3478F6] hover:underline flex items-center gap-1"
                      >
                        {copiedHash === "prev_hash" ? <Check size={12} /> : <Copy size={12} />}
                        {copiedHash === "prev_hash" ? "Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                  <div className="p-2.5 bg-gray-100 text-[#475569] font-mono text-[11px] rounded-lg break-all">
                    {selectedEvent.prev_hash || "Genesis Event (00000000000000000000000000000000)"}
                  </div>
                </div>
              </div>

              {selectedEvent.details && (
                <div>
                  <span className="font-semibold text-[#18243A] block mb-1">Reason / Authorization Details</span>
                  <div className="p-2.5 bg-[#F6F8FC] border border-[#E5EAF2] rounded-lg text-[#18243A] font-mono text-[11px] break-all">
                    {selectedEvent.details}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-5 pt-3 border-t border-[#E5EAF2]">
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedEvent(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#3478F6] uppercase tracking-wider mb-1">
            <ClipboardList size={14} /> Immutable Security Ledger
          </div>
          <h1 className="text-2xl font-bold text-[#18243A] tracking-tight">Audit Trail</h1>
          <p className="text-[#6B778C] text-sm mt-0.5">
            {isAdmin
              ? "Cryptographically chained record of all logins, uploads, permission changes, and access events."
              : "Tamper-evident activity history registered for your account."}
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="btn btn-primary self-start md:self-auto shadow-sm"
          >
            {verifying ? (
              <span className="spinner" style={{ width: 14, height: 14 }} />
            ) : (
              <ShieldCheck size={16} />
            )}
            Verify Hash Chain
          </button>
        )}
      </div>

      {/* Verification Result Banner (Admin) */}
      {verifyResult && (
        <div className={`p-4 rounded-xl border mb-6 flex items-start justify-between gap-4 transition-all ${
          verifyResult.valid
            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : "bg-red-50 border-red-200 text-red-900"
        }`}>
          <div className="flex items-start gap-3">
            {verifyResult.valid ? (
              <ShieldCheck size={28} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert size={28} className="text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm">
                  {verifyResult.valid ? "Cryptographic Chain Verified Valid" : "Tampering / Discrepancy Detected"}
                </h4>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  verifyResult.valid
                    ? "bg-emerald-200 text-emerald-800"
                    : "bg-red-200 text-red-800"
                }`}>
                  {verifyResult.valid ? "Integrity Passed" : "Verification Failed"}
                </span>
              </div>
              <p className="text-xs opacity-95 mt-1 font-medium">
                {verifyResult.summary || (verifyResult.valid
                  ? `Successfully validated ${verifyResult.checked} consecutive audit event blocks. SHA-256 hash chaining is 100% intact.`
                  : `Checked ${verifyResult.checked} events. Discrepancies detected across ${verifyResult.failed_event_ids?.length || verifyResult.errors?.length || 0} event(s).`)}
              </p>
              {!verifyResult.valid && verifyResult.failed_event_ids && verifyResult.failed_event_ids.length > 0 && (
                <div className="mt-2 text-xs">
                  <span className="font-semibold text-red-800">Failed Event IDs ({verifyResult.failed_event_ids.length}):</span>
                  <div className="flex flex-wrap gap-1.5 mt-1 max-h-24 overflow-y-auto">
                    {verifyResult.failed_event_ids.map((id) => (
                      <span key={id} className="font-mono text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded border border-red-300">
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {!verifyResult.valid && verifyResult.errors && verifyResult.errors.length > 0 && (
                <details className="mt-2 text-[11px] text-red-700">
                  <summary className="cursor-pointer font-semibold hover:underline">
                    View technical verification details ({verifyResult.errors.length} item{verifyResult.errors.length > 1 ? "s" : ""})
                  </summary>
                  <ul className="list-disc list-inside mt-1 space-y-0.5 pl-1 max-h-32 overflow-y-auto">
                    {verifyResult.errors.map((err, idx) => (
                      <li key={idx} className="font-mono text-[10px]">{err}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
          <button
            onClick={() => setVerifyResult(null)}
            className="opacity-60 hover:opacity-100 text-xs font-medium p-1 shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Real Audit Metrics Row (Admin) */}
      {isAdmin && auditStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="stat-card">
            <div className="stat-icon bg-blue-50 text-[#3478F6]">
              <ClipboardList size={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-[#6B778C] uppercase">Total Events</p>
              <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">{auditStats.total_events}</h3>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-[#6B778C] uppercase">Authorized Access</p>
              <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">{auditStats.successful_access}</h3>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon bg-red-50 text-red-600">
              <XCircle size={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-[#6B778C] uppercase">Denied Attempts</p>
              <h3 className="text-2xl font-bold text-[#18243A] mt-0.5">{auditStats.denied_access}</h3>
            </div>
          </div>

          <div className="stat-card">
            <div className={`stat-icon ${auditStats.suspicious_incidents_count > 0 ? "bg-amber-50 text-amber-600" : "bg-purple-50 text-purple-600"}`}>
              <ShieldAlert size={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-[#6B778C] uppercase">Suspicious Alerts</p>
              <div className="flex items-center gap-2 mt-0.5">
                <h3 className="text-2xl font-bold text-[#18243A]">{auditStats.suspicious_incidents_count}</h3>
                {auditStats.suspicious_incidents_count > 0 && (
                  <span className="badge badge-orange text-[10px] font-bold">Action Req</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suspicious Activity Detection Card (Admin) */}
      {isAdmin && suspiciousReport && (
        <div className="card p-5 mb-6 border border-[#E5EAF2]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5EAF2]">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className={suspiciousReport.incidents_count > 0 ? "text-red-500" : "text-emerald-500"} size={20} />
              <div>
                <h3 className="text-sm font-bold text-[#18243A]">Automated Suspicious Activity Detection</h3>
                <p className="text-xs text-[#6B778C]">
                  Rule: Flag actors with ≥ {suspiciousReport.threshold} denied or failed attempts (brute-force or unauthorized probing).
                </p>
              </div>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              suspiciousReport.incidents_count > 0
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
            }`}>
              {suspiciousReport.incidents_count > 0
                ? `${suspiciousReport.incidents_count} Suspicious Incident${suspiciousReport.incidents_count > 1 ? "s" : ""}`
                : "No Suspicious Clusters Detected"}
            </span>
          </div>

          {suspiciousReport.incidents && suspiciousReport.incidents.length > 0 ? (
            <div className="mt-4 space-y-3">
              {suspiciousReport.incidents.map((incident: any, idx: number) => (
                <div key={idx} className="p-3.5 bg-red-50/60 border border-red-200/80 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-[#18243A]">
                        {incident.actor_email || incident.ip_address || "Unknown Actor"}
                      </span>
                      <span className="badge bg-red-100 text-red-800 border-red-300 font-bold text-[10px]">
                        {incident.denied_count} Denied Attempts ({incident.severity} SEVERITY)
                      </span>
                      {incident.ip_address && (
                        <span className="text-xs font-mono text-[#6B778C]">IP: {incident.ip_address}</span>
                      )}
                    </div>
                    <p className="text-xs text-[#475569]">
                      <strong>Attempted Actions:</strong> {incident.attempted_actions.join(", ")}
                      {incident.target_resources?.length > 0 && (
                        <> · <strong>Target Resources:</strong> {incident.target_resources.join(", ")}</>
                      )}
                    </p>
                    {incident.reasons?.length > 0 && (
                      <p className="text-xs text-[#6B778C]">
                        <strong>Reason:</strong> {incident.reasons[incident.reasons.length - 1]}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      const filterVal = incident.actor_email || incident.ip_address || "";
                      setSearch(filterVal);
                      setUserFilter(incident.actor_email || "");
                      auditApi.list({ search: filterVal, page_size: 100 }).then(setEvents);
                    }}
                    className="btn btn-secondary btn-sm self-start md:self-auto shrink-0 text-xs"
                  >
                    Inspect Actor Events
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-200/60">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>All access requests are currently within expected parameters. Zero actors have exceeded the threshold of {suspiciousReport.threshold} denied attempts.</span>
            </div>
          )}
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="card p-4 mb-6 space-y-3">
        <form onSubmit={handleSearchSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B778C] pointer-events-none" />
              <input
                className="input input-with-icon"
                placeholder="Search by action, actor email, or resource..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {isAdmin && (
              <input
                className="input sm:w-48 text-xs"
                placeholder="Filter by actor email..."
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-[#E5EAF2] text-xs">
            <label className="text-[#6B778C] font-medium flex items-center gap-1.5">
              <span>From</span>
              <input
                type="date"
                className="input py-1 px-2 w-auto text-xs"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </label>

            <label className="text-[#6B778C] font-medium flex items-center gap-1.5">
              <span>To</span>
              <input
                type="date"
                className="input py-1 px-2 w-auto text-xs"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </label>

            {isAdmin && (
              <>
                <select
                  className="input select w-auto py-1 text-xs"
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                >
                  <option value="all">All Actions</option>
                  {actionsList.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>

                <select
                  className="input select w-auto py-1 text-xs"
                  value={outcomeFilter}
                  onChange={(e) => setOutcomeFilter(e.target.value)}
                >
                  <option value="all">All Outcomes</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                  <option value="allowed">Allowed</option>
                  <option value="denied">Denied</option>
                </select>
              </>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button type="submit" className="btn btn-secondary btn-sm">
                <Filter size={13} /> Filter
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setUserFilter("");
                  setFromDate("");
                  setToDate("");
                  setActionFilter("all");
                  setOutcomeFilter("all");
                  loadEvents();
                }}
                className="btn btn-ghost btn-sm"
                title="Reset Filters"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Events Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <p className="text-xs text-[#6B778C]">Querying tamper-evident ledger...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="empty-state py-16">
            <ClipboardList size={48} className="mx-auto mb-3 opacity-30 text-[#3478F6]" />
            <h3 className="text-base font-semibold text-[#18243A]">No audit events recorded</h3>
            <p className="text-sm text-[#6B778C] mt-1 max-w-sm mx-auto">
              Any file operations, sharing requests, or authentications will generate cryptographically linked event hashes here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Seq #</th>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target Resource</th>
                  <th>Outcome</th>
                  <th>Reason / Details</th>
                  <th>Hash Digest</th>
                  <th className="text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const style = OUTCOME_STYLES[ev.outcome] || {
                    bg: "bg-gray-100 text-gray-700 border-gray-200",
                    text: "text-gray-700",
                    icon: Activity,
                  };
                  const OutcomeIcon = style.icon;

                  return (
                    <tr key={ev.id || ev.sequence_num} className="hover:bg-[#F9FAFC] transition-colors">
                      <td className="font-mono text-xs font-bold text-[#3478F6]">
                        #{ev.sequence_num}
                      </td>
                      <td className="text-xs text-[#6B778C] whitespace-nowrap">
                        {format(new Date(ev.timestamp), "MMM d, HH:mm:ss")}
                      </td>
                      <td>
                        <div className="text-xs">
                          <span className="font-semibold text-[#18243A] block">
                            {ev.actor_email || "System"}
                          </span>
                          {ev.ip_address && (
                            <span className="text-[11px] text-[#6B778C] font-mono">{ev.ip_address}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-blue font-mono text-[11px] font-semibold">
                          {ev.action}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs text-[#18243A] font-medium truncate block max-w-[160px]">
                          {ev.resource_name || (ev.resource_id ? ev.resource_id.substring(0, 8) + "..." : "—")}
                        </span>
                      </td>
                      <td>
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${style.bg}`}>
                          <OutcomeIcon size={12} />
                          {ev.outcome.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs text-[#6B778C] truncate block max-w-[180px]" title={ev.details || ""}>
                          {ev.details || "—"}
                        </span>
                      </td>
                      <td>
                        <div className="hash-badge">
                          <Lock size={10} className="text-[#3478F6]" />
                          <span className="truncate max-w-[110px]">{ev.event_hash}</span>
                        </div>
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => setSelectedEvent(ev)}
                          className="btn btn-ghost p-1.5 rounded-lg hover:text-[#3478F6]"
                          title="Inspect Cryptographic Block"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
