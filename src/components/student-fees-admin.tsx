"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw, Search, Wallet } from "lucide-react";

type FeeStudent = {
  studentId: string;
  fullName: string | null;
  rollNumber: string | null;
  registrationNumber: string | null;
  sessionYear: string | null;
  semester: number;
  department: string | null;
  feeAmount: string;
  paidAmount: string;
};

type FeeEdit = { sessionYear: string; feeAmount: string; paidAmount: string };
type FeePagination = { page: number; pageSize: number; total: number; totalPages: number };

export function StudentFeesAdmin({ instituteId }: { instituteId: string }) {
  const [students, setStudents] = useState<FeeStudent[]>([]);
  const [edits, setEdits] = useState<Record<string, FeeEdit>>({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<FeePagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [loadedRequestKey, setLoadedRequestKey] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const params = new URLSearchParams({
    instituteId,
    page: String(page),
    pageSize: String(pagination.pageSize),
    refreshKey: String(refreshKey),
  });
  if (debouncedSearch) params.set("search", debouncedSearch);
  const requestKey = params.toString();
  const loading = Boolean(instituteId) && loadedRequestKey !== requestKey;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!instituteId) return;
    const controller = new AbortController();
    void fetch(`/api/student-fees?${requestKey}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json() as {
        students?: FeeStudent[];
        pagination?: FeePagination;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Unable to load student fees.");
      const rows = body.students ?? [];
      setStudents(rows);
      setPagination(body.pagination ?? { page, pageSize: 50, total: rows.length, totalPages: 1 });
      setEdits(Object.fromEntries(rows.map((row) => [row.studentId, {
        sessionYear: row.sessionYear ?? "",
        feeAmount: row.feeAmount,
        paidAmount: row.paidAmount,
      }])));
      setError("");
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setStudents([]);
        setEdits({});
        setError(reason instanceof Error ? reason.message : "Unable to load student fees.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoadedRequestKey(requestKey);
    });
    return () => controller.abort();
  }, [instituteId, page, pagination.pageSize, debouncedSearch, refreshKey, requestKey]);

  async function saveFee(event: FormEvent<HTMLFormElement>, student: FeeStudent) {
    event.preventDefault();
    const edit = edits[student.studentId];
    if (!edit || !instituteId) return;
    setBusyId(student.studentId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/student-fees", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instituteId,
          studentId: student.studentId,
          sessionYear: edit.sessionYear,
          semester: student.semester,
          feeAmount: Number(edit.feeAmount),
          paidAmount: Number(edit.paidAmount),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to save the fee record.");
      setMessage(`Fee record saved for ${student.fullName || student.rollNumber || "student"}.`);
      setStudents((current) => current.map((row) => row.studentId === student.studentId
        ? { ...row, sessionYear: edit.sessionYear, feeAmount: Number(edit.feeAmount).toFixed(2), paidAmount: Number(edit.paidAmount).toFixed(2) }
        : row));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the fee record.");
    } finally {
      setBusyId("");
    }
  }

  return <section className="pending-requests-module">
    <div className="page-heading">
      <div>
        <div className="eyebrow">INSTITUTE WORKSPACE</div>
        <h1>Student fees</h1>
        <p className="subtitle">Maintain fee and paid amounts against each existing student&apos;s current session and semester.</p>
      </div>
      <button className="btn" type="button" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}>
        <RefreshCw size={15} />Refresh
      </button>
    </div>

    {error && <div className="login-alert" role="alert">{error}</div>}
    {message && <div className="pending-success" role="status">{message}</div>}
    {!instituteId ? <div className="pending-empty">Select an institute workspace to manage student fees.</div> : loading && !students.length ? (
      <div className="pending-empty">Loading student fee records…</div>
    ) : <>
      <label className="student-fees-search">
        <Search size={16} />
        <input value={search} onChange={(event) => { setSearch(event.target.value); setError(""); }} placeholder="Search name, roll, registration or technology" />
      </label>
      <div className="pending-request-list">
        {loading ? <div className="pending-empty">Loading student fee records…</div> : students.length ? students.map((student) => {
          const edit = edits[student.studentId] ?? { sessionYear: student.sessionYear ?? "", feeAmount: "", paidAmount: "0.00" };
          return <article className="pending-request-card" key={student.studentId}>
            <div className="pending-request-card-header">
              <div>
                <h2>{student.fullName || "Student"}</h2>
                <p>{student.rollNumber || "No roll"} · {student.registrationNumber || "No registration"}</p>
              </div>
              <span className="pending-status">{student.department ?? "Technology not provided"} · Semester {student.semester}</span>
            </div>
            <form className="student-fee-edit" onSubmit={(event) => void saveFee(event, student)}>
              <label className="field"><span>Session</span><input value={edit.sessionYear} onChange={(event) => setEdits((current) => ({ ...current, [student.studentId]: { ...edit, sessionYear: event.target.value } }))} maxLength={20} required /></label>
              <label className="field"><span>Semester fee</span><input type="number" min="0" step="0.01" value={edit.feeAmount} onChange={(event) => setEdits((current) => ({ ...current, [student.studentId]: { ...edit, feeAmount: event.target.value } }))} required /></label>
              <label className="field"><span>Paid amount</span><input type="number" min="0" step="0.01" value={edit.paidAmount} onChange={(event) => setEdits((current) => ({ ...current, [student.studentId]: { ...edit, paidAmount: event.target.value } }))} required /></label>
              <div className="student-fee-due"><span>Due amount</span><strong>{edit.feeAmount && Number.isFinite(Number(edit.feeAmount)) && Number.isFinite(Number(edit.paidAmount))
                ? (Number(edit.feeAmount) - Number(edit.paidAmount)).toFixed(2)
                : "—"}</strong></div>
              <button className="btn primary" type="submit" disabled={busyId === student.studentId || !edit.sessionYear.trim()}>
                <Wallet size={15} />{busyId === student.studentId ? "Saving…" : "Save fee"}
              </button>
            </form>
          </article>;
        }) : <div className="pending-empty">No active students match this search.</div>}
      </div>
      <div className="table-foot">
        <span>Showing {students.length ? (page - 1) * pagination.pageSize + 1 : 0}–{Math.min(page * pagination.pageSize, pagination.total)} of {pagination.total} students</span>
        <span className="pagination">
          <button className="btn small" type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Page {page} of {Math.max(1, pagination.totalPages)}</span>
          <button className="btn small" type="button" disabled={loading || page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </span>
      </div>
    </>}
  </section>;
}
