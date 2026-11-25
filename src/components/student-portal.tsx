"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowDownToLine, BookOpenCheck, LogOut, Nfc, QrCode } from "lucide-react";
import QRCode from "qrcode";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { NoticeFeed } from "@/components/notice-board";

type StudentProfile = {
  name: string;
  email: string | null;
  phone: string | null;
  roll: string;
  registration: string;
  department: string;
  semester: string;
  sessionYear: string;
  instituteId: string | null;
};

type PublishedResult = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  credits: number;
  semester: number;
  examName: string;
  examYear: number;
  marks: number | null;
  fullMarks: number;
  gradePoint: number | null;
  letterGrade: string | null;
  publishedAt: string | null;
};

type AttendanceRecord = {
  attendanceDate: string;
  status: "present" | "absent";
  department: string;
  semester: number;
};

type StudentFee = {
  sessionYear: string;
  semester: number;
  feeAmount: number;
  paidAmount: number;
  dueAmount: number;
};

function vCardValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function StudentPortal({
  student,
  results,
  semesterGpas,
  cgpa,
  attendance,
  fees,
  passwordChangeRequired,
}: {
  student: StudentProfile | null;
  results: PublishedResult[];
  semesterGpas: { semester: number; examName: string; examYear: number; gpa: number }[];
  cgpa: number | null;
  attendance: { total: number; present: number; records: AttendanceRecord[] };
  fees: StudentFee[];
  passwordChangeRequired: boolean;
}) {
  const router = useRouter();
  const [logoutError, setLogoutError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [qrResult, setQrResult] = useState<{ contactCard: string; url?: string; error?: string } | null>(null);
  const [nfcMessage, setNfcMessage] = useState("");
  const [nfcToken, setNfcToken] = useState("");
  const [nfcSaving, setNfcSaving] = useState(false);
  const [hasActiveNfcCard, setHasActiveNfcCard] = useState(false);
  const [nfcStatusLoading, setNfcStatusLoading] = useState(Boolean(student));
  const [studentCardQr, setStudentCardQr] = useState<{ token: string; url?: string; error?: string } | null>(null);

  const contactCard = student?.phone
    ? `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${vCardValue(student.name)}\r\nTEL;TYPE=CELL:${vCardValue(student.phone)}\r\nORG:${vCardValue("AMRPI")}\r\nNOTE:Student Roll ${vCardValue(student.roll)}\r\nEND:VCARD`
    : "";

  useEffect(() => {
    if (!contactCard) return;
    let active = true;
    QRCode.toDataURL(contactCard, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
      color: { dark: "#10233b", light: "#ffffff" },
    }).then((url) => {
      if (active) setQrResult({ contactCard, url });
    }).catch(() => {
      if (active) setQrResult({ contactCard, error: "Could not generate the contact card QR code." });
    });
    return () => { active = false; };
  }, [contactCard]);

  useEffect(() => {
    if (!nfcToken) return;
    let active = true;
    const scanUrl = `${window.location.origin}/nfc-scan#token=${encodeURIComponent(nfcToken)}`;
    QRCode.toDataURL(scanUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
      color: { dark: "#10233b", light: "#ffffff" },
    }).then((url) => {
      if (active) setStudentCardQr({ token: nfcToken, url });
    }).catch(() => {
      if (active) setStudentCardQr({ token: nfcToken, error: "Could not generate the secure student ID QR code." });
    });
    return () => { active = false; };
  }, [nfcToken]);

  useEffect(() => {
    if (!student) return;
    let active = true;
    void fetch("/api/students/nfc-card", { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { active?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load student card status.");
      if (active) setHasActiveNfcCard(body.active === true);
    }).catch((reason: unknown) => {
      if (active) {
        setNfcMessage(reason instanceof Error ? reason.message : "Unable to load student card status.");
      }
    }).finally(() => {
      if (active) setNfcStatusLoading(false);
    });
    return () => { active = false; };
  }, [student]);

  async function signOut() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed.");
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Unable to sign out right now. Please try again.");
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    setPasswordSaving(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: formData.get("currentPassword"),
          newPassword: formData.get("newPassword"),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to update your password.");
      setPasswordMessage("Password updated. Your academic dashboard is now available.");
      form.reset();
      router.refresh();
    } catch (reason) {
      setPasswordError(reason instanceof Error ? reason.message : "Unable to update your password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function issueNfcCard() {
    setNfcMessage("");
    setNfcSaving(true);
    try {
      const response = await fetch("/api/students/nfc-card", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json() as { error?: string; token?: string };
      if (!response.ok || !body.token) {
        throw new Error(body.error ?? "Unable to issue a secure student card.");
      }
      setNfcToken(body.token);
      setHasActiveNfcCard(true);
      setNfcMessage("Secure student card issued. Write the token to an NFC tag or use its QR code. Issuing another card replaces this one.");
    } catch (reason) {
      setNfcMessage(reason instanceof Error ? reason.message : "Unable to issue a secure student card.");
    } finally {
      setNfcSaving(false);
    }
  }

  async function writeNfcCard() {
    setNfcMessage("");
    if (!nfcToken) {
      setNfcMessage("Issue a secure student card before writing an NFC tag.");
      return;
    }
    const NDEFReaderClass = window.NDEFReader;
    if (!NDEFReaderClass) {
      setNfcMessage("NFC writing is not supported by this browser or device. Use the secure student ID QR code instead.");
      return;
    }
    try {
      await new NDEFReaderClass().write({
        records: [{ recordType: "mime", mediaType: "application/vnd.amrpi.student-card", data: nfcToken }],
      });
      setNfcMessage("Secure student card token written to the NFC tag.");
    } catch (reason) {
      setNfcMessage(reason instanceof Error && reason.name === "NotAllowedError"
        ? "NFC writing permission was denied. Allow NFC access and try again."
        : "NFC writing was cancelled or unavailable. Use the secure student ID QR code instead.");
    }
  }

  async function deactivateNfcCard() {
    setNfcMessage("");
    setNfcSaving(true);
    try {
      const response = await fetch("/api/students/nfc-card", {
        method: "DELETE",
        cache: "no-store",
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to deactivate the NFC card.");
      setNfcToken("");
      setStudentCardQr(null);
      setHasActiveNfcCard(false);
      setNfcMessage("Student card deactivated. Its NFC tag and QR code can no longer be verified.");
    } catch (reason) {
      setNfcMessage(reason instanceof Error ? reason.message : "Unable to deactivate the NFC card.");
    } finally {
      setNfcSaving(false);
    }
  }

  const attendancePercent = attendance.total
    ? Math.round((attendance.present / attendance.total) * 100)
    : 0;
  const vCardDownload = contactCard
    ? `data:text/vcard;charset=utf-8,${encodeURIComponent(contactCard)}`
    : undefined;
  const qrDataUrl = qrResult?.contactCard === contactCard ? qrResult.url ?? "" : "";
  const qrError = qrResult?.contactCard === contactCard ? qrResult.error ?? "" : "";

  return <main className="student-page">
    <header className="student-header"><div className="brand-mark"><span>AM</span></div><div><strong>AMRPI</strong><span>STUDENT PORTAL</span></div><button className="btn" type="button" onClick={signOut}><LogOut size={15} />Sign out</button></header>
    <section className="student-content">
      {logoutError && <div className="login-alert" role="alert">{logoutError}</div>}
      <div className="eyebrow">MY ACADEMIC WORKSPACE</div>
      <h1>Welcome, {student?.name || "Student"}</h1>
      <p className="subtitle">Your personal academic information is visible only to your account.</p>

      {passwordChangeRequired ? <section className="student-password-panel">
        <h2>Secure your new account</h2>
        <p>For your protection, change the one-time password emailed by the institute before continuing.</p>
        {passwordError && <div className="login-alert" role="alert">{passwordError}</div>}
        {passwordMessage && <div className="public-inline-success" role="status">{passwordMessage}</div>}
        <form className="student-password-form" onSubmit={(event) => void changePassword(event)}>
          <label className="field"><span>One-time password</span><input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required /></label>
          <label className="field"><span>New password (at least 10 characters)</span><input name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
          <button className="btn primary" type="submit" disabled={passwordSaving}>{passwordSaving ? "Updating…" : "Change password"}</button>
        </form>
      </section> : <>
        {student ? <>
          <section className="student-details" aria-label="My academic record">
            <h2>My academic profile</h2>
            <div className="profile-grid">
              {[
                ["Full name", student.name || "Not provided"],
                ["Email", student.email ?? "Not provided"],
                ["Phone", student.phone ?? "Not provided"],
                ["Roll number", student.roll],
                ["Registration number", student.registration],
                ["Department / Technology", student.department],
                ["Semester", student.semester],
                ["Session", student.sessionYear],
              ].map(([label, value]) => <div className="profile-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
          </section>

          <section className="student-academic-section" aria-label="Published exam results">
            <div className="student-section-heading"><div><BookOpenCheck size={18} /><div><h2>Published results</h2><p>Only results officially published by your institute are shown.</p></div></div></div>
            <div className="student-gpa-summary">
              <article><span>Cumulative GPA</span><strong>{cgpa === null ? "—" : cgpa.toFixed(2)}</strong><small>Based on each subject&apos;s latest published grade</small></article>
              {semesterGpas.map((item) => <article key={`${item.semester}-${item.examName}-${item.examYear}`}>
                <span>Semester {item.semester} · {item.examName} · {item.examYear}</span>
                <strong>{item.gpa.toFixed(2)}</strong>
                <small>Credit-weighted GPA</small>
              </article>)}
            </div>
            {results.length ? <div className="student-record-list">{results.map((result) => <article className="student-record-card" key={result.id}>
              <div><strong>{result.subjectName}</strong><span>{result.subjectCode ?? "Subject"} · {result.examName} · {result.examYear}</span></div>
              <div className="student-result-value"><strong>{result.marks ?? "—"}{result.marks !== null ? ` / ${result.fullMarks}` : ""}</strong><span>{result.letterGrade ?? (result.gradePoint === null ? "—" : `GPA ${result.gradePoint.toFixed(2)}`)}</span></div>
            </article>)}</div> : <div className="pending-empty">No published exam results are available yet.</div>}
          </section>

          <section className="student-academic-section" aria-label="Semester fees">
            <div className="student-section-heading"><div><BookOpenCheck size={18} /><div><h2>Semester fees</h2><p>Balances recorded by your institute for this linked student record.</p></div></div></div>
            {fees.length ? <div className="student-record-list">{fees.map((fee) => <article className="student-record-card" key={`${fee.sessionYear}-${fee.semester}`}>
              <div><strong>{fee.sessionYear} · Semester {fee.semester}</strong><span>Fee {fee.feeAmount.toFixed(2)} · Paid {fee.paidAmount.toFixed(2)}</span></div>
              <div className="student-result-value"><strong>{fee.dueAmount.toFixed(2)}</strong><span>Due amount</span></div>
            </article>)}</div> : <div className="pending-empty">No semester fee records are available yet.</div>}
          </section>

          <section className="student-academic-section" aria-label="Attendance record">
            <div className="student-section-heading"><div><Nfc size={18} /><div><h2>Attendance</h2><p>{attendance.present} of {attendance.total} recorded attendance days present ({attendancePercent}%).</p></div></div></div>
            {attendance.records.length ? <div className="student-attendance-list">{attendance.records.map((item, index) => <article key={`${item.attendanceDate}-${index}`}>
              <time dateTime={item.attendanceDate}>{new Date(`${item.attendanceDate}T00:00:00`).toLocaleDateString()}</time>
              <span>{item.department} · Semester {item.semester}</span>
              <strong className={item.status}>{item.status}</strong>
            </article>)}</div> : <div className="pending-empty">No attendance records are available yet.</div>}
          </section>
        </> : <div className="callout" role="status">No student profile is linked to this account yet. Contact your institute administrator to connect your account.</div>}
        {student?.instituteId && <NoticeFeed instituteId={student.instituteId} title="Institute notices" subtitle="Official announcements and documents published by your institute." />}

        {student && <section className="student-digital-id" aria-label="Student contact card">
          <div className="student-id-card-content">
            <div className="student-id-card-details">
              <span className="student-id-eyebrow"><Nfc size={14} />STUDENT CONTACT CARD</span>
              <h2>{student.name}</h2>
              <p>{student.department} · {student.semester}</p>
              <dl><div><dt>Roll</dt><dd>{student.roll || "—"}</dd></div><div><dt>Registration</dt><dd>{student.registration || "—"}</dd></div><div><dt>Session</dt><dd>{student.sessionYear}</dd></div><div><dt>Phone</dt><dd>{student.phone || "Not available"}</dd></div></dl>
              <p className="student-id-caption">This contact card is separate from the secure, revocable student ID card.</p>
            </div>
            <div className="student-id-qr">
              {qrDataUrl ? <Image unoptimized width={240} height={240} src={qrDataUrl} alt={`Contact QR code for ${student.name}`} /> : qrError ? <span role="alert">{qrError}</span> : contactCard ? <span>Preparing QR code…</span> : <span>Phone number is unavailable for contact sharing.</span>}
              <span><QrCode size={14} />CONTACT CARD</span>
            </div>
          </div>
          <div className="student-id-actions">
            {vCardDownload && <a className="btn small" href={vCardDownload} download={`${student.roll || "student"}-contact.vcf`}><ArrowDownToLine size={14} />Download contact</a>}
          </div>
        </section>}
        {student && <section className="student-digital-id" aria-label="Secure student ID card">
          <div className="student-id-card-content">
            <div className="student-id-card-details">
              <span className="student-id-eyebrow"><Nfc size={14} />SECURE STUDENT ID</span>
              <h2>Verified institute card</h2>
              {hasActiveNfcCard && !nfcToken && <p>An active card already exists, but its private token is not recoverable. Replace it to generate a new QR code or deactivate it.</p>}
              {!hasActiveNfcCard && !nfcToken && <p>No active student card is issued.</p>}
              <p>Only a hashed token is stored. Replacing or deactivating this card immediately invalidates its QR code and NFC tag.</p>
              <p className="student-id-caption">Keep the token private. Anyone holding an active card can view the limited identity details shown by the scanner.</p>
            </div>
            <div className="student-id-qr">
              {studentCardQr?.token === nfcToken && studentCardQr.url
                ? <Image unoptimized width={240} height={240} src={studentCardQr.url} alt="Secure student ID verification QR code" />
                : studentCardQr?.token === nfcToken && studentCardQr.error
                  ? <span role="alert">{studentCardQr.error}</span>
                  : nfcToken ? <span>Preparing secure QR code…</span> : <span>Issue a card to create its secure NFC token and QR code.</span>}
              <span><QrCode size={14} />VERIFIED ID</span>
            </div>
          </div>
          <div className="student-id-actions">
            <button className="btn small" type="button" disabled={nfcSaving || nfcStatusLoading} onClick={() => void issueNfcCard()}>
              <Nfc size={14} />{nfcSaving || nfcStatusLoading ? "Updating…" : nfcToken || hasActiveNfcCard ? "Replace student card" : "Issue student card"}
            </button>
            {nfcToken && <button className="btn small" type="button" disabled={nfcSaving} onClick={() => void writeNfcCard()}>
              <Nfc size={14} />Write to NFC tag
            </button>}
            {(nfcToken || hasActiveNfcCard) && <button className="btn small" type="button" disabled={nfcSaving || nfcStatusLoading} onClick={() => void deactivateNfcCard()}>
              Deactivate card
            </button>}
          </div>
          {nfcMessage && <p className="student-nfc-message" role="status">{nfcMessage}</p>}
        </section>}
      </>}

      <div className="callout student-callout"><strong>Student privacy:</strong> this portal only loads the student record linked to your authenticated account. The contact QR shares phone details; secure student ID scans reveal limited directory details and can be revoked.</div>
    </section>
  </main>;
}
