"use client";

import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Search,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { NoticeFeed } from "@/components/notice-board";
import { AmrpiInstitutionSection } from "@/components/amrpi-institution-section";
import { DEFAULT_PUBLIC_PROFILE } from "@/lib/public-profile/defaults";
import type { InstitutePublicProfile } from "@/lib/public-profile/types";
import { POLYTECHNIC_DEPARTMENTS } from "@/lib/students/options";

type PublicInstitute = { id: string; name: string; category: string | null };
type AdmissionCircular = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  applicationDeadline: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
};
type PublicResult = {
  studentId: string;
  studentName: string | null;
  rollNumber: string | null;
  registrationNumber: string | null;
  semester: number;
  department: string | null;
  sessionYear: string | null;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  examName: string;
  examYear: number;
  examFullMarks: number;
  marks: number | null;
  gradePoint: number | null;
  letterGrade: string | null;
  publishedAt: string | null;
};
type TrackedApplication = {
  trackingId: string;
  status: string;
  submittedAt: string;
  title: string;
  fullName: string;
};

const SEMESTERS = Array.from({ length: 8 }, (_, index) => ({
  value: index + 1,
  label: `${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"} Semester`,
}));
const EXAM_TYPES = ["Final Examination", "Midterm Exam", "Class Test"];
const SESSION_OPTIONS = (() => {
  const year = new Date().getFullYear();
  return Array.from({ length: year - 2021 + 1 }, (_, index) => {
    const start = year - index;
    return [`${start}-${String(start + 1).slice(-2)}`, String(start)];
  }).flat();
})();
const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  accepted: "Accepted",
  rejected: "Rejected",
};

function PublicDate({ value }: { value: string }) {
  const date = new Date(value);
  return <time dateTime={value}>{Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  })}</time>;
}

function updateHeroCardTilt(event: PointerEvent<HTMLDivElement>) {
  if (event.pointerType === "touch") return;
  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  const y = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
  card.style.setProperty("--hero-tilt-x", `${(-y * 8).toFixed(2)}deg`);
  card.style.setProperty("--hero-tilt-y", `${(x * 10).toFixed(2)}deg`);
  card.style.setProperty("--hero-light-x", `${((x + 1) * 50).toFixed(1)}%`);
  card.style.setProperty("--hero-light-y", `${((y + 1) * 50).toFixed(1)}%`);
  card.style.setProperty("--hero-glow-opacity", "1");
}

function resetHeroCardTilt(event: PointerEvent<HTMLDivElement>) {
  const card = event.currentTarget;
  card.style.setProperty("--hero-tilt-x", "0deg");
  card.style.setProperty("--hero-tilt-y", "0deg");
  card.style.setProperty("--hero-light-x", "50%");
  card.style.setProperty("--hero-light-y", "50%");
  card.style.setProperty("--hero-glow-opacity", ".42");
}

export function PublicPortal() {
  const [institutes, setInstitutes] = useState<PublicInstitute[]>([]);
  const [instituteId, setInstituteId] = useState("");
  const [instituteLoading, setInstituteLoading] = useState(true);
  const [catalogSemester, setCatalogSemester] = useState("1");
  const [sessions, setSessions] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [sessionYear, setSessionYear] = useState("");
  const [department, setDepartment] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [examType, setExamType] = useState(EXAM_TYPES[0]);
  const [searchBy, setSearchBy] = useState<"rollNumber" | "studentName" | "registrationNumber">("rollNumber");
  const [searchValue, setSearchValue] = useState("");
  const [results, setResults] = useState<PublicResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState("");
  const [circulars, setCirculars] = useState<AdmissionCircular[]>([]);
  const [circularLoading, setCircularLoading] = useState(false);
  const [circularError, setCircularError] = useState("");
  const [publicProfile, setPublicProfile] = useState<InstitutePublicProfile | null>(null);
  const [publicProfileError, setPublicProfileError] = useState("");
  const [selectedCircular, setSelectedCircular] = useState("");
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [applicationError, setApplicationError] = useState("");
  const [applicationSaving, setApplicationSaving] = useState(false);
  const [trackEmail, setTrackEmail] = useState("");
  const [trackPassword, setTrackPassword] = useState("");
  const [trackSaving, setTrackSaving] = useState(false);
  const [trackError, setTrackError] = useState("");
  const [trackedApplications, setTrackedApplications] = useState<TrackedApplication[]>([]);
  const [applicantSignedIn, setApplicantSignedIn] = useState(false);
  const applicationFormRef = useRef<HTMLDivElement>(null);
  const [studentRegistrationError, setStudentRegistrationError] = useState("");
  const [studentRegistrationMessage, setStudentRegistrationMessage] = useState("");
  const [studentRegistrationSaving, setStudentRegistrationSaving] = useState(false);

  const selectedInstitute = useMemo(
    () => institutes.find((institute) => institute.id === instituteId) ?? null,
    [institutes, instituteId],
  );
  const activePublicProfile = publicProfile?.instituteId === instituteId
    ? publicProfile
    : instituteId ? { instituteId, ...DEFAULT_PUBLIC_PROFILE, updatedAt: null } : null;
  const activeCircular = useMemo(
    () => circulars.find((circular) => circular.id === selectedCircular) ?? null,
    [circulars, selectedCircular],
  );
  const groupedResults = useMemo(() => {
    const groups = new Map<string, PublicResult[]>();
    for (const result of results) {
      const current = groups.get(result.studentId) ?? [];
      current.push(result);
      groups.set(result.studentId, current);
    }
    return [...groups.values()];
  }, [results]);

  useEffect(() => {
    const controller = new AbortController();
    const loadInstitutes = async () => {
      setInstituteLoading(true);
      try {
        const response = await fetch("/api/public/institutes", { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as { data?: PublicInstitute[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load institutes.");
        const options = body.data ?? [];
        setInstitutes(options);
        setInstituteId((current) => current && options.some((institute) => institute.id === current)
          ? current
          : options[0]?.id ?? "");
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") {
          setResultsError(reason.message);
          setCircularError(reason.message);
          setStudentRegistrationError(reason.message);
        }
      } finally {
        if (!controller.signal.aborted) setInstituteLoading(false);
      }
    };
    void loadInstitutes();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!instituteId) return;
    const controller = new AbortController();
    const loadCatalog = async () => {
      setCatalogLoading(true);
      try {
        const params = new URLSearchParams({ instituteId, semester: catalogSemester });
        const response = await fetch(`/api/public/catalog?${params}`, { signal: controller.signal });
        const body = await response.json() as { sessions?: string[]; departments?: string[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load academic sessions.");
        const availableSessions = body.sessions ?? [];
        const sessionOptions = [...new Set([...availableSessions, ...SESSION_OPTIONS])]
          .sort((left, right) => right.localeCompare(left));
        const departmentOptions = [...new Set([...(body.departments ?? []), ...POLYTECHNIC_DEPARTMENTS])]
          .sort((left, right) => left.localeCompare(right));
        setSessions(sessionOptions);
        setDepartments(departmentOptions);
        setSessionYear((current) => availableSessions.includes(current)
          ? current
          : availableSessions[0] ?? sessionOptions[0] ?? "");
        setDepartment((current) => departmentOptions.includes(current)
          ? current
          : departmentOptions.includes("Computer Technology")
            ? "Computer Technology"
            : departmentOptions[0] ?? "");
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") setResultsError(reason.message);
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    };
    void loadCatalog();
    return () => controller.abort();
  }, [instituteId, catalogSemester]);

  useEffect(() => {
    if (!instituteId) return;
    const controller = new AbortController();
    const loadCirculars = async () => {
      setCircularLoading(true);
      setCircularError("");
      try {
        const params = new URLSearchParams({ instituteId });
        const response = await fetch(`/api/public/admissions?${params}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as { data?: AdmissionCircular[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load admission circulars.");
        const data = body.data ?? [];
        setCirculars(data);
        setSelectedCircular((current) => data.some((circular) => circular.id === current)
          ? current
          : "");
        setApplicationOpen(false);
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") setCircularError(reason.message);
      } finally {
        if (!controller.signal.aborted) setCircularLoading(false);
      }
    };
    void loadCirculars();
    return () => controller.abort();
  }, [instituteId]);

  useEffect(() => {
    if (!instituteId) return;
    const controller = new AbortController();
    const loadProfile = async () => {
      setPublicProfileError("");
      try {
        const response = await fetch(`/api/public/profile?instituteId=${encodeURIComponent(instituteId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json() as { data?: InstitutePublicProfile; error?: string };
        if (!response.ok || !body.data) throw new Error(body.error ?? "Unable to load the institute profile.");
        setPublicProfile(body.data);
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") {
          setPublicProfileError(reason.message);
          setPublicProfile({ instituteId, ...DEFAULT_PUBLIC_PROFILE, updatedAt: null });
        }
      }
    };
    void loadProfile();
    return () => controller.abort();
  }, [instituteId]);

  useEffect(() => {
    const controller = new AbortController();
    const loadApplicantSession = async () => {
      try {
        const response = await fetch("/api/public/applications", { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as { authenticated?: boolean; applications?: TrackedApplication[] };
        if (response.ok && body.authenticated) {
          setApplicantSignedIn(true);
          setTrackedApplications(body.applications ?? []);
        }
      } catch {
        if (!controller.signal.aborted) setApplicantSignedIn(false);
      }
    };
    void loadApplicantSession();
    return () => controller.abort();
  }, []);

  async function searchResults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResults([]);
    setResultsError("");
    if (!instituteId || !sessionYear || !department || !searchValue.trim()) {
      setResultsError("Select the institute, academic session, semester, and department, then enter your search value.");
      return;
    }
    setResultsLoading(true);
    try {
      const response = await fetch("/api/public/results", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instituteId,
          sessionYear,
          semester: Number(catalogSemester),
          department,
          examType,
          [searchBy]: searchValue.trim(),
        }),
      });
      const body = await response.json() as { data?: PublicResult[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to search results.");
      setResults(body.data ?? []);
      if (!body.data?.length) setResultsError("No published results matched those details. Check your selection and search value.");
    } catch (reason) {
      setResultsError(reason instanceof Error ? reason.message : "Unable to search results.");
    } finally {
      setResultsLoading(false);
    }
  }

  async function applyOnline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplicationSaving(true);
    setApplicationError("");
    setApplicationMessage("");
    const form = event.currentTarget;
    try {
      const formData = new FormData(form);
      const response = await fetch("/api/public/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          noticeId: selectedCircular,
          email: formData.get("email"),
          password: formData.get("password"),
          fullName: formData.get("fullName"),
          phone: formData.get("phone"),
          department,
          semester: Number(catalogSemester),
          sessionYear,
          message: formData.get("message"),
        }),
      });
      const body = await response.json() as { error?: string; trackingId?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to submit application.");
      setApplicantSignedIn(true);
      setTrackEmail(String(formData.get("email") ?? ""));
      setTrackPassword("");
      setApplicationMessage(`Application submitted. Your tracking ID is ${body.trackingId}.`);
      form.reset();
      await loadApplications();
    } catch (reason) {
      setApplicationError(reason instanceof Error ? reason.message : "Unable to submit application.");
    } finally {
      setApplicationSaving(false);
    }

  }

  async function registerStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStudentRegistrationError("");
    setStudentRegistrationMessage("");
    if (!selectedInstitute) {
      setStudentRegistrationError(instituteLoading
        ? "Wait for the institute list to finish loading."
        : "No approved institute is available. Contact the institute administrator before submitting a request.");
      return;
    }

    setStudentRegistrationSaving(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const response = await fetch("/api/public/student-registrations", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instituteId: selectedInstitute.id,
          fullName: formData.get("fullName"),
          fatherName: formData.get("fatherName"),
          roll: formData.get("roll"),
          registration: formData.get("registration"),
          email: formData.get("email"),
          phone: formData.get("phone"),
        }),
      });
      const body = await response.json() as {
        error?: string;
        success?: boolean;
        submitted?: boolean;
        updated?: boolean;
        message?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Unable to submit the student account request.");
      if (!body.success || !body.submitted) throw new Error("The registration request was not saved. Please try again.");
      setStudentRegistrationMessage(
        body.message ?? (body.updated
          ? "Account request updated successfully."
          : "Account request submitted successfully."),
      );
      form.reset();
    } catch (reason) {
      setStudentRegistrationError(reason instanceof Error ? reason.message : "Unable to submit the student account request.");
    } finally {
      setStudentRegistrationSaving(false);
    }
  }

  function applyToCircular(circular: AdmissionCircular) {
    setSelectedCircular(circular.id);
    setApplicationError("");
    setApplicationMessage("");
    setApplicationOpen(true);

    const text = `${circular.title}\n${circular.body}`;
    const sessionMatch = text.match(/\b(20\d{2})\s*[-–/]\s*(\d{2,4})\b/);
    if (sessionMatch) {
      const endYear = sessionMatch[2]!.length === 2 ? sessionMatch[2] : sessionMatch[2]!.slice(-2);
      const candidate = `${sessionMatch[1]}-${endYear}`;
      if (sessions.includes(candidate)) setSessionYear(candidate);
    }
    const semesterMatch = text.match(/\b([1-8])(?:st|nd|rd|th)?\s+semester\b/i);
    if (semesterMatch) setCatalogSemester(semesterMatch[1]!);

    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      applicationFormRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      });
    });
  }

  async function loadApplications() {
    const response = await fetch("/api/public/applications", { cache: "no-store" });
    const body = await response.json() as { authenticated?: boolean; applications?: TrackedApplication[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "Unable to load application status.");
    setApplicantSignedIn(Boolean(body.authenticated));
    setTrackedApplications(body.applications ?? []);
  }

  async function signInApplicant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTrackSaving(true);
    setTrackError("");
    try {
      const response = await fetch("/api/public/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login", email: trackEmail, password: trackPassword }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to sign in.");
      setTrackPassword("");
      await loadApplications();
    } catch (reason) {
      setTrackError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setTrackSaving(false);
    }
  }

  async function signOutApplicant() {
    setTrackError("");
    try {
      const response = await fetch("/api/public/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!response.ok) throw new Error("Unable to sign out.");
      setApplicantSignedIn(false);
      setTrackedApplications([]);
    } catch (reason) {
      setTrackError(reason instanceof Error ? reason.message : "Unable to sign out.");
    }
  }

  return (
    <main className="public-portal">
      <header className="public-portal-header">
        <Link className="public-portal-brand" href="/">
          <span className="brand-mark"><GraduationCap size={21} /></span>
          <span><strong>{activePublicProfile?.instituteName ?? "AMRPI"}</strong><small>POLYTECHNIC SERVICES</small></span>
        </Link>
        <nav className="public-portal-nav" aria-label="Public portal">
          <a href="#results">Find a result</a>
          <a href="#apply">Apply online</a>
          <a href="#track">Track application</a>
          <a href="#student-portal">Student Portal</a>
          <a href="#notices">Notices</a>
        </nav>
        <Link className="btn primary public-login-link" href="/login"><ShieldCheck size={15} />Institute login</Link>
      </header>

      <section className="public-portal-hero">
        <div className="public-hero-content">
          <span className="public-hero-eyebrow"><BookOpenCheck size={14} />POLYTECHNIC INSTITUTE SERVICES</span>
          <h1>{activePublicProfile?.heroTitle ?? DEFAULT_PUBLIC_PROFILE.heroTitle}</h1>
          {activePublicProfile?.heroTitleBn && <p className="public-hero-name-bn" lang="bn">{activePublicProfile.heroTitleBn}</p>}
          <p>{activePublicProfile?.heroDescription ?? DEFAULT_PUBLIC_PROFILE.heroDescription}</p>
          <a className="btn primary public-hero-action" href="#results">Find a result <ArrowRight size={16} /></a>
          <div className="public-hero-trust"><CheckCircle2 size={15} />Official academic and admission information</div>
        </div>
        <div
          className="public-hero-card"
          aria-hidden="true"
          onPointerMove={updateHeroCardTilt}
          onPointerLeave={resetHeroCardTilt}
        >
          <div className="public-hero-card-top"><span><GraduationCap size={17} /> POLYTECHNIC PORTAL</span><span className="public-live-dot">LIVE</span></div>
          <div className="public-hero-card-illustration"><div className="public-orbit public-orbit-one" /><div className="public-orbit public-orbit-two" /><div className="public-cap-icon"><GraduationCap size={68} strokeWidth={1.2} /></div><div className="public-float-card public-float-top"><CheckCircle2 size={17} /><span><b>Results</b><small>Ready to search</small></span></div><div className="public-float-card public-float-bottom"><ClipboardList size={17} /><span><b>Admissions</b><small>Apply online</small></span></div></div>
          <div className="public-hero-card-footer"><span>ACADEMIC SERVICES</span><strong>Study · Apply · Achieve</strong></div>
        </div>
      </section>

      <div className="public-portal-main">
        {institutes.length > 1 && <div className="public-institute-context"><label htmlFor="public-institute">Selected institute</label><select id="public-institute" value={instituteId} onChange={(event) => setInstituteId(event.target.value)}>{institutes.map((institute) => <option value={institute.id} key={institute.id}>{institute.name}</option>)}</select></div>}
        {!instituteLoading && !institutes.length && <div className="callout attendance-notice" role="alert">No approved institutes are currently available.</div>}

        <section className="public-section" id="results">
          <div className="public-section-heading"><div><span className="public-section-number">01 / RESULTS</span><h2>AMRPI Institute Result</h2><p>Choose your institute and academic details, then search with a single identifier.</p></div><span className="public-heading-icon"><Search /></span></div>
          <div className="public-card public-result-card">
            <form className="public-result-form" onSubmit={(event) => void searchResults(event)}>
              <div className="public-filter-grid">
                <label className="field"><span>Institute *</span><select value={instituteId} disabled={instituteLoading || !institutes.length} onChange={(event) => setInstituteId(event.target.value)}><option value="">Select institute</option>{institutes.map((institute) => <option value={institute.id} key={institute.id}>{institute.name}</option>)}</select></label>
                <label className="field"><span>Academic session *</span><select value={sessionYear} disabled={catalogLoading || !sessions.length} onChange={(event) => setSessionYear(event.target.value)}><option value="">Select session</option>{sessions.map((session) => <option key={session}>{session}</option>)}</select></label>
                <label className="field"><span>Semester *</span><select value={catalogSemester} onChange={(event) => setCatalogSemester(event.target.value)}>{SEMESTERS.map((semester) => <option value={semester.value} key={semester.value}>{semester.label}</option>)}</select></label>
                <label className="field"><span>Department / technology *</span><select value={department} disabled={catalogLoading || !departments.length} onChange={(event) => setDepartment(event.target.value)}><option value="">Select department</option>{departments.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="field"><span>Exam type *</span><select value={examType} onChange={(event) => setExamType(event.target.value)}>{EXAM_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
              </div>
              <div className="public-search-divider" />
              <div className="public-search-criteria">
                <fieldset className="public-search-by"><legend>Search by one</legend><div>
                  <label className={searchBy === "rollNumber" ? "selected" : ""}><input type="radio" name="resultSearchBy" checked={searchBy === "rollNumber"} onChange={() => { setSearchBy("rollNumber"); setSearchValue(""); }} />Roll number</label>
                  <label className={searchBy === "studentName" ? "selected" : ""}><input type="radio" name="resultSearchBy" checked={searchBy === "studentName"} onChange={() => { setSearchBy("studentName"); setSearchValue(""); }} />Student name</label>
                  <label className={searchBy === "registrationNumber" ? "selected" : ""}><input type="radio" name="resultSearchBy" checked={searchBy === "registrationNumber"} onChange={() => { setSearchBy("registrationNumber"); setSearchValue(""); }} />Registration number <small>optional</small></label>
                </div></fieldset>
                <label className="field public-result-query"><span>{searchBy === "rollNumber" ? "Roll number" : searchBy === "studentName" ? "Student name" : "Registration number"} *</span><input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} maxLength={150} required placeholder={searchBy === "rollNumber" ? "Enter your roll number" : searchBy === "studentName" ? "Enter all or part of your name" : "Enter your registration number"} /></label>
                <button className="btn primary public-search-submit" type="submit" disabled={resultsLoading || instituteLoading || catalogLoading || !sessions.length || !departments.length}>{resultsLoading ? "Searching…" : <><Search size={16} />Search results</>}</button>
              </div>
              {resultsError && <div className="public-inline-error" role="alert">{resultsError}</div>}
            </form>
            {groupedResults.length > 0 && <div className="public-results-list" aria-live="polite">
              {groupedResults.map((studentRows) => {
                const student = studentRows[0]!;
                return <article className="public-student-result" key={student.studentId}>
                  <div className="public-student-result-header"><div><span className="public-result-kicker">PUBLISHED EXAM RESULT</span><h3>{student.studentName || "Student"}</h3><p>Roll {student.rollNumber || "—"}{student.registrationNumber ? ` · Registration ${student.registrationNumber}` : ""} · {student.department} · {student.sessionYear}</p></div><span className="public-result-semester">{SEMESTERS[student.semester - 1]?.label}</span></div>
                  <div className="table-scroll"><table className="public-results-table"><thead><tr><th>Subject</th><th>Code</th><th>Exam</th><th>Year</th><th>Marks</th><th>Grade</th></tr></thead><tbody>
                    {studentRows.map((row) => <tr key={`${row.subjectId}-${row.examYear}`}><td>{row.subjectName}</td><td>{row.subjectCode || "—"}</td><td>{row.examName}</td><td>{row.examYear}</td><td><strong>{row.marks ?? "—"}</strong> / {row.examFullMarks}</td><td>{row.letterGrade || (row.gradePoint === null ? "—" : row.gradePoint.toFixed(2))}</td></tr>)}
                  </tbody></table></div>
                </article>;
              })}
            </div>}
          </div>
          <a
            className="public-board-result-link"
            href="https://btebresultszone.com/bn/results"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="public-board-result-icon"><GraduationCap size={19} /></span>
            <span className="public-board-result-copy">
              <strong>BTEB Board Result</strong>
              <small>Open the official board results portal</small>
            </span>
            <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </section>

        <section className="public-section" id="apply">
          <div className="public-section-heading"><div><span className="public-section-number">02 / ADMISSIONS</span><h2>Apply online</h2><p>Review an open admission circular and submit an application directly to the institute.</p></div><span className="public-heading-icon"><ClipboardList /></span></div>
          <div className={`public-admission-layout${applicationOpen ? " has-application" : ""}`}>
            <div className="public-circular-column">
              <div className="public-subsection-heading"><h3>Open admission circulars</h3><span>{circulars.length} open</span></div>
              {circularError && <div className="public-inline-error" role="alert">{circularError}</div>}
              {circularLoading ? <div className="public-empty-card">Loading admission circulars…</div>
                : circulars.length ? circulars.map((circular) => <article className={`public-circular-card${selectedCircular === circular.id ? " selected" : ""}`} key={circular.id}>
                  <div className="public-circular-card-top"><span className="notice-category">Admission open</span>{circular.applicationDeadline && <span className="public-deadline">Deadline · {circular.applicationDeadline}</span>}</div>
                  <h3>{circular.title}</h3><div className="public-circular-copy">{circular.body}</div>
                  <div className="public-circular-actions"><PublicDate value={circular.publishedAt} />{circular.attachmentUrl && /^https?:\/\//i.test(circular.attachmentUrl) && <a href={circular.attachmentUrl} target="_blank" rel="noreferrer">View circular {circular.attachmentName ? `· ${circular.attachmentName}` : ""}<ArrowUpRight size={13} /></a>}<button type="button" className={`btn small${selectedCircular === circular.id && applicationOpen ? " primary" : ""}`} onClick={() => applyToCircular(circular)}>Apply Now <ArrowRight size={13} /></button></div>
                </article>)
                  : <div className="public-empty-card"><BellRing size={20} /><strong>No active admission circulars right now. Please check back later.</strong></div>}
            </div>
            {applicationOpen && activeCircular && <div className="public-application-column public-application-reveal" ref={applicationFormRef}>
              <div className="public-subsection-heading"><h3>Application form</h3><span>Secure submission</span></div>
              <form className="public-card public-application-form" onSubmit={(event) => void applyOnline(event)}>
                <p className="public-form-intro">Applying to: <strong>{activeCircular.title}</strong>{activeCircular.applicationDeadline && <> · Deadline: {activeCircular.applicationDeadline}</>}{sessionYear && <> · Session: {sessionYear}</>}</p>
                <label className="field"><span>Applicant full name *</span><input name="fullName" minLength={2} maxLength={160} required /></label>
                <label className="field"><span>Email address *</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
                <label className="field"><span>Create or confirm password *</span><input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /><small>Use the same email and password to track your applications.</small></label>
                <label className="field"><span>Phone number</span><input name="phone" type="tel" maxLength={30} autoComplete="tel" /></label>
                <div className="public-form-selects">
                  <label className="field"><span>Applying semester *</span><select value={catalogSemester} onChange={(event) => setCatalogSemester(event.target.value)}>{SEMESTERS.map((semester) => <option value={semester.value} key={semester.value}>{semester.label}</option>)}</select></label>
                  <label className="field"><span>Academic session *</span><select value={sessionYear} onChange={(event) => setSessionYear(event.target.value)}><option value="">Select session</option>{sessions.map((session) => <option key={session}>{session}</option>)}</select></label>
                </div>
                <label className="field"><span>Department / technology *</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">Select department</option>{departments.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="field"><span>Additional information</span><textarea name="message" rows={3} maxLength={3000} placeholder="Optional message for the admission office" /></label>
                {applicationError && <div className="public-inline-error" role="alert">{applicationError}</div>}
                {applicationMessage && <div className="public-inline-success" role="status">{applicationMessage}</div>}
                <button className="btn primary public-apply-submit" type="submit" disabled={applicationSaving || !activeCircular || !sessionYear || !department}>{applicationSaving ? "Submitting…" : <>Submit application <ArrowRight size={15} /></>}</button>
                <small className="public-privacy-note"><ShieldCheck size={13} />Application details are encrypted before storage.</small>
              </form>
            </div>}
          </div>
        </section>

        <section className="public-section" id="track">
          <div className="public-section-heading"><div><span className="public-section-number">03 / TRACKING</span><h2>Track your application</h2><p>Sign in with the email and password used when you applied to review application status.</p></div><span className="public-heading-icon"><ClipboardList /></span></div>
          <div className="public-card public-tracking-card">
            {trackError && <div className="public-inline-error" role="alert">{trackError}</div>}
            {applicantSignedIn ? <div className="public-tracking-authenticated">
              <div className="public-tracking-title"><div><h3>Your applications</h3><p>Status updates from participating institutes.</p></div><button className="btn small" type="button" onClick={() => void signOutApplicant()}>Sign out</button></div>
              {trackedApplications.length ? <div className="public-application-list">{trackedApplications.map((application) => <article className="public-application-status" key={application.trackingId}><div className="public-application-status-icon"><ClipboardList size={17} /></div><div className="public-application-status-main"><span className="public-result-kicker">TRACKING ID · {application.trackingId}</span><strong>{application.title}</strong><span>{application.fullName} · Submitted <PublicDate value={application.submittedAt} /></span></div><span className={`public-status-badge ${application.status}`}>{STATUS_LABELS[application.status] ?? application.status}</span></article>)}</div>
                : <div className="public-empty-card">No applications are linked to this account yet.</div>}
            </div> : <form className="public-track-login" onSubmit={(event) => void signInApplicant(event)}>
              <div className="public-track-login-intro"><span className="public-heading-icon"><ShieldCheck /></span><div><h3>Applicant sign in</h3><p>Use your application email and password.</p></div></div>
              <div className="public-track-login-fields"><label className="field"><span>Email address</span><input type="email" autoComplete="username" value={trackEmail} onChange={(event) => setTrackEmail(event.target.value)} required /></label><label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={trackPassword} onChange={(event) => setTrackPassword(event.target.value)} required /></label><button className="btn primary" type="submit" disabled={trackSaving}>{trackSaving ? "Signing in…" : "View application status"}</button></div>
              <p className="public-track-footnote">New applicant? Submit an application above to create your tracking account.</p>
            </form>}
          </div>
        </section>

        <section className="public-section" id="student-portal">
          <div className="public-section-heading"><div><span className="public-section-number">04 / STUDENT ACCESS</span><h2>Student Portal</h2><p>Request a secure account linked to your institute student record.</p></div><span className="public-heading-icon"><UserPlus /></span></div>
          <div className="public-card student-registration-card">
            <div className="student-registration-intro">
              <span className="public-heading-icon"><ShieldCheck /></span>
              <div><h3>Register for student access</h3><p>Registration details must match the institute&apos;s active student directory. An administrator reviews each request before an account is created.</p></div>
            </div>
            {studentRegistrationError && <div className="public-inline-error" role="alert">{studentRegistrationError}</div>}
            {studentRegistrationMessage && <div className="public-inline-success" role="status">{studentRegistrationMessage}</div>}
            {!instituteLoading && !institutes.length && !studentRegistrationError && (
              <div className="public-inline-error" role="status">
                Student registration is unavailable because no approved institute is configured yet.
              </div>
            )}
            <form className="student-registration-form" onSubmit={(event) => void registerStudent(event)}>
              <label className="field">
                <span>Institute *</span>
                <select
                  value={instituteId}
                  disabled={instituteLoading || !institutes.length}
                  onChange={(event) => {
                    setInstituteId(event.target.value);
                    setStudentRegistrationError("");
                    setStudentRegistrationMessage("");
                  }}
                  required
                >
                  <option value="">{instituteLoading ? "Loading institutes…" : "Select institute"}</option>
                  {institutes.map((institute) => (
                    <option value={institute.id} key={institute.id}>{institute.name}</option>
                  ))}
                </select>
              </label>
              <label className="field"><span>Full name</span><input name="fullName" autoComplete="name" minLength={2} maxLength={160} required /></label>
              <label className="field"><span>Father&apos;s name</span><input name="fatherName" maxLength={160} required /></label>
              <label className="field"><span>Roll number</span><input name="roll" maxLength={40} required /></label>
              <label className="field"><span>Registration number</span><input name="registration" maxLength={60} required /></label>
              <label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
              <label className="field"><span>Phone number</span><input name="phone" type="tel" autoComplete="tel" minLength={6} maxLength={30} required /></label>
              <div className="student-registration-submit">
                <span>{selectedInstitute ? `Institute: ${selectedInstitute.name}` : "Select an available institute to register."}</span>
                <button className="btn primary" type="submit" disabled={studentRegistrationSaving || instituteLoading}>
                  {studentRegistrationSaving ? "Submitting…" : "Submit account request"}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="public-section" id="notices">
          <div className="public-section-heading"><div><span className="public-section-number">05 / UPDATES</span><h2>Notices</h2><p>Official written announcements, scanned images, and published documents.</p></div><span className="public-heading-icon"><BellRing /></span></div>
          {selectedInstitute
            ? <NoticeFeed instituteId={selectedInstitute.id} title={`${selectedInstitute.name} notices`} subtitle="Published institute announcements and documents." />
            : <div className="public-empty-card">Select an institute to see its notices.</div>}
        </section>
        {publicProfileError && <div className="public-inline-error" role="status">{publicProfileError} Showing the default institute profile.</div>}
        {activePublicProfile && <AmrpiInstitutionSection profile={activePublicProfile} />}
      </div>

      <footer className="public-portal-footer"><Link href="/" className="public-portal-brand"><span className="brand-mark"><GraduationCap size={19} /></span><span><strong>{activePublicProfile?.instituteName ?? "AMRPI"}</strong><small>POLYTECHNIC SERVICES</small></span></Link><span>Official institute information and student services</span><Link href="/login">Institute login</Link></footer>
    </main>
  );
}
