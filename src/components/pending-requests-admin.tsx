"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, Mail, RefreshCw, ShieldCheck, X } from "lucide-react";

type StudentRequest = {
  id: string;
  studentId: string;
  loginId: string | null;
  fullName: string;
  fatherName: string;
  rollNumber: string;
  registrationNumber: string;
  email: string;
  phone: string;
  requestedAt: string;
  status: string;
  credentialsEmailSentAt: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  requestEmailStatus: string;
  requestEmailAttempts: number;
  requestEmailError: string | null;
  approvalEmailStatus: string;
  approvalEmailAttempts: number;
  approvalEmailError: string | null;
  rejectionEmailStatus: string;
  rejectionEmailAttempts: number;
  rejectionEmailError: string | null;
  setupConfirmationEmailStatus: string;
  setupConfirmationEmailAttempts: number;
  setupConfirmationEmailError: string | null;
  passwordChangeRequired: boolean | null;
  department: string | null;
  semester: number;
  sessionYear: string | null;
};

type AdmissionApplication = {
  id: string;
  trackingId: string;
  status: string;
  submittedAt: string;
  title: string;
  applicant: {
    fullName: string;
    email: string;
    phone: string;
    department: string;
    semester: string | number;
    sessionYear: string;
    message: string;
  };
};

type RequestData = {
  studentRequests: StudentRequest[];
  admissionApplications: AdmissionApplication[];
};

type Tab = "students" | "applications";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

export function PendingRequestsAdmin({
  instituteId,
  initialTab = "students",
}: {
  instituteId: string;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<RequestData>({ studentRequests: [], admissionApplications: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [testEmailBusy, setTestEmailBusy] = useState(false);

  useEffect(() => {
    if (!instituteId) {
      return;
    }

    let active = true;
    let controller: AbortController | null = null;
    let refreshTimer: number | undefined;
    let requestInFlight = false;

    const loadRequests = async () => {
      if (!active || requestInFlight) return;
      requestInFlight = true;
      const requestController = new AbortController();
      controller = requestController;
      try {
        const response = await fetch(`/api/admin/pending-requests?instituteId=${encodeURIComponent(instituteId)}`, {
          cache: "no-store",
          signal: requestController.signal,
        });
        const body = await response.json() as RequestData & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load pending requests.");
        if (active) {
          setData({
            studentRequests: body.studentRequests ?? [],
            admissionApplications: body.admissionApplications ?? [],
          });
          setError("");
        }
      } catch (reason) {
        if (active && reason instanceof Error && reason.name !== "AbortError") setError(reason.message);
      } finally {
        requestInFlight = false;
        if (active) {
          setLoading(false);
          refreshTimer = window.setTimeout(
            () => {
              refreshTimer = undefined;
              if (document.visibilityState === "visible") void loadRequests();
            },
            30_000,
          );
        }
      }
    };

    void loadRequests();
    const refreshVisibleRequests = () => {
      if (document.visibilityState !== "visible") return;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = undefined;
      void loadRequests();
    };
    window.addEventListener("focus", refreshVisibleRequests);
    document.addEventListener("visibilitychange", refreshVisibleRequests);

    return () => {
      active = false;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      window.removeEventListener("focus", refreshVisibleRequests);
      document.removeEventListener("visibilitychange", refreshVisibleRequests);
      controller?.abort();
    };
  }, [instituteId, refreshKey]);

  async function updateRequest(input: {
    id: string;
    kind: "student" | "application";
    action: string;
    notificationType?: "request_received" | "approval" | "rejection" | "password_setup_confirmation";
  }) {
    if (!instituteId) return;
    let rejectionReason: string | undefined;
    if (input.kind === "student" && input.action === "approve" &&
      !window.confirm("Approve this student account and send the temporary login credentials?")) return;
    if (input.kind === "student" && input.action === "reject") {
      const reason = window.prompt("Optional rejection reason to include in the student email:");
      if (reason === null) return;
      rejectionReason = reason.trim().slice(0, 2_000);
    }
    setBusyId(input.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/pending-requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, rejectionReason, instituteId }),
      });
      const body = await response.json() as { error?: string; message?: string; emailSent?: boolean };
      if (!response.ok) throw new Error(body.error ?? "Unable to update this request.");
      setMessage(body.message ?? "Request updated.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update this request.");
    } finally {
      setBusyId("");
    }
  }

  async function sendTestEmail() {
    setTestEmailBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/email-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to send the test email.");
      setMessage(body.message ?? "Test email sent to your administrator address.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send the test email.");
    } finally {
      setTestEmailBusy(false);
    }
  }

  return (
    <section className="pending-requests-module">
      <div className="page-heading">
        <div>
          <div className="eyebrow">INSTITUTE WORKSPACE</div>
          <h1>Pending requests</h1>
          <p className="subtitle">Review student account registrations and college admission applications.</p>
        </div>
        <div className="pending-request-toolbar">
          <button className="btn" type="button" onClick={() => void sendTestEmail()} disabled={testEmailBusy}>
            <Mail size={15} />{testEmailBusy ? "Sending test…" : "Test email"}
          </button>
          <button className="btn" type="button" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}>
            <RefreshCw size={15} />Refresh
          </button>
        </div>
      </div>

      <div className="pending-request-tabs" role="tablist" aria-label="Pending request types">
        <button className={tab === "students" ? "active" : ""} type="button" role="tab" aria-selected={tab === "students"} onClick={() => setTab("students")}>
          <ShieldCheck size={16} />Student Account Requests<span>{data.studentRequests.filter((request) => request.status === "pending").length}</span>
        </button>
        <button className={tab === "applications" ? "active" : ""} type="button" role="tab" aria-selected={tab === "applications"} onClick={() => setTab("applications")}>
          <Clock3 size={16} />Admission Applications<span>{data.admissionApplications.length}</span>
        </button>
      </div>

      {error && <div className="login-alert" role="alert">{error}</div>}
      {message && <div className="pending-success" role="status">{message}</div>}
      {!instituteId ? <div className="pending-empty">Select an institute workspace to view pending requests.</div> : loading ? <div className="pending-empty">Loading requests…</div> : tab === "students" ? (
        <div className="pending-request-list">
          {data.studentRequests.length ? data.studentRequests.map((item) => (
            <article className="pending-request-card" key={item.id}>
              <div className="pending-request-card-header">
                <div><h2>{item.fullName}</h2><p>Requested {formatDate(item.requestedAt)}{item.reviewedAt ? ` · Reviewed ${formatDate(item.reviewedAt)}` : ""}</p></div>
                <span className={`pending-status ${item.status}`}>{item.status === "pending" ? "Awaiting approval" : item.status}</span>
              </div>
              <div className="pending-request-fields">
                <span><small>Full Name</small><strong>{item.fullName}</strong></span>
                <span><small>Father&apos;s Name</small><strong>{item.fatherName}</strong></span>
                <span><small>Roll Number</small><strong>{item.rollNumber}</strong></span>
                {item.loginId && <span><small>Student Login ID</small><strong>{item.loginId}</strong></span>}
                <span><small>Registration Number</small><strong>{item.registrationNumber}</strong></span>
                <span><small>Department / Semester</small><strong>{item.department ?? "—"} · {item.semester}</strong></span>
                <span><small>Session</small><strong>{item.sessionYear ?? "—"}</strong></span>
                <span><small>Email Address</small><strong>{item.email}</strong></span>
                <span><small>Phone Number</small><strong>{item.phone}</strong></span>
              </div>
              <div className="pending-email-status">
                {(item.status === "pending"
                  ? [{
                    type: "request_received" as const,
                    label: "Request receipt",
                    status: item.requestEmailStatus,
                    attempts: item.requestEmailAttempts,
                    error: item.requestEmailError,
                  }]
                  : item.status === "approved"
                    ? [
                      {
                        type: "approval" as const,
                        label: "Approval email",
                        status: item.approvalEmailStatus,
                        attempts: item.approvalEmailAttempts,
                        error: item.approvalEmailError,
                      },
                      ...(!item.passwordChangeRequired ? [{
                        type: "password_setup_confirmation" as const,
                        label: "Password confirmation",
                        status: item.setupConfirmationEmailStatus,
                        attempts: item.setupConfirmationEmailAttempts,
                        error: item.setupConfirmationEmailError,
                      }] : []),
                    ]
                    : [{
                      type: "rejection" as const,
                      label: "Rejection email",
                      status: item.rejectionEmailStatus,
                      attempts: item.rejectionEmailAttempts,
                      error: item.rejectionEmailError,
                    }]
                ).map((notification) => <div className="pending-email-entry" key={notification.type}>
                  <span className={`pending-status email-status ${notification.status}`}>{notification.label}: {notification.status.replaceAll("_", " ")}</span>
                  {notification.attempts > 0 && <span>{notification.attempts} attempt{notification.attempts === 1 ? "" : "s"}</span>}
                  {notification.error && <p role="status">{notification.error}</p>}
                  {(notification.status === "failed" || notification.status === "pending") && (
                    <button className="btn small" type="button" disabled={busyId === item.id} onClick={() => void updateRequest({
                      id: item.id,
                      kind: "student",
                      action: "retry_email",
                      notificationType: notification.type,
                    })}>
                      <Mail size={14} />{busyId === item.id ? "Sending…" : "Retry"}
                    </button>
                  )}
                </div>)}
              </div>
              {item.rejectionReason && <p className="pending-applicant-message"><strong>Rejection reason:</strong> {item.rejectionReason}</p>}
              <div className="pending-request-actions">
                {item.status === "pending" ? <>
                  <button className="btn primary" type="button" disabled={busyId === item.id} onClick={() => void updateRequest({ id: item.id, kind: "student", action: "approve" })}>
                    <Check size={15} />{busyId === item.id ? "Approving…" : "Approve & send setup link"}
                  </button>
                  <button className="btn danger" type="button" disabled={busyId === item.id} onClick={() => void updateRequest({ id: item.id, kind: "student", action: "reject" })}>
                    <X size={15} />Reject
                  </button>
                </> : null}
              </div>
            </article>
          )) : <div className="pending-empty">No student account requests have been submitted.</div>}
        </div>
      ) : (
        <div className="pending-request-list">
          {data.admissionApplications.length ? data.admissionApplications.map((item) => (
            <article className="pending-request-card" key={item.id}>
              <div className="pending-request-card-header">
                <div><h2>{item.applicant.fullName || "Applicant"}</h2><p>{item.title} · {item.trackingId} · {formatDate(item.submittedAt)}</p></div>
                <span className={`pending-status ${item.status}`}>{item.status.replaceAll("_", " ")}</span>
              </div>
              <div className="pending-request-fields">
                <span><small>Email / Phone</small><strong>{item.applicant.email || "—"} / {item.applicant.phone || "—"}</strong></span>
                <span><small>Department</small><strong>{item.applicant.department || "—"}</strong></span>
                <span><small>Semester / Session</small><strong>{item.applicant.semester || "—"} / {item.applicant.sessionYear || "—"}</strong></span>
              </div>
              {item.applicant.message && <p className="pending-applicant-message">{item.applicant.message}</p>}
              <div className="pending-request-actions">
                <label className="pending-status-control">
                  <span>Status</span>
                  <select value={item.status} disabled={busyId === item.id} onChange={(event) => void updateRequest({ id: item.id, kind: "application", action: event.target.value })}>
                    <option value="submitted">Submitted</option>
                    <option value="under_review">Under review</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
                <a className="btn small" href={`mailto:${encodeURIComponent(item.applicant.email)}?subject=${encodeURIComponent(`AMRPI application ${item.trackingId}`)}`}>
                  <Mail size={14} />Contact applicant
                </a>
              </div>
            </article>
          )) : <div className="pending-empty">No admission applications have been submitted to this institute.</div>}
        </div>
      )}
    </section>
  );
}
