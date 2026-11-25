"use client";

import {
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  FileText,
  GraduationCap,
  Image,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  Plus,
  Search,
  Settings,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  XCircle,
  X,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { StudentListResponse, StudentRecord, StudentStatus } from "@/lib/students/types";
import { POLYTECHNIC_DEPARTMENTS } from "@/lib/students/options";
import type { AppRole } from "@/lib/auth/authorization";
import { NoticeBoardAdmin } from "@/components/notice-board";
import { PublicProfileAdmin } from "@/components/public-profile-admin";
import { PendingRequestsAdmin } from "@/components/pending-requests-admin";
import { StudentFeesAdmin } from "@/components/student-fees-admin";
import { canonicalDepartmentLabel } from "@/lib/exam-results/departments";

const navigation: { name: string; icon: LucideIcon; badge?: string }[] = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Students", icon: Users },
  { name: "Pending Requests", icon: Clock3 },
  { name: "Student Fees", icon: Wallet },
  { name: "Exam Results", icon: TrendingUp },
  { name: "Notice Board", icon: Megaphone },
  { name: "Public Profile", icon: Image },
  { name: "Teachers", icon: BriefcaseBusiness },
  { name: "Admission Applications", icon: UserPlus },
  { name: "Attendance", icon: CalendarDays },
  { name: "Subscription", icon: Wallet },
];

const SESSION_START_YEAR = 2021;

const pageDescriptions: Record<string, { heading: string; description: string; note: string; icon: LucideIcon }> = {
  Students: { heading: "Student directory", description: "Browse and manage students by polytechnic semester and department.", note: "Student records are loaded from Neon.", icon: Users },
  "Pending Requests": { heading: "Student requests", description: "Review student records awaiting approval.", note: "Requests use the student approval status.", icon: Clock3 },
  "Student Fees": { heading: "Student fees", description: "Maintain semester fee balances for existing student records.", note: "Student fee summaries", icon: Wallet },
  "Exam Results": { heading: "Exam results", description: "Manage semester subjects and publish student marks, grades, and GPA.", note: "Exam results", icon: TrendingUp },
  "Notice Board": { heading: "Notice board", description: "Publish official written notices, scanned images, and PDFs for students.", note: "Public institute notices", icon: Megaphone },
  "Public Profile": { heading: "Public institute profile", description: "Manage the leadership, academic departments, services, contact information, and links shown on the public portal.", note: "Public website content", icon: Image },
  Teachers: { heading: "Teacher directory", description: "Teacher profiles are not editable in this release.", note: "Backend connection required", icon: BriefcaseBusiness },
  "Admission Applications": { heading: "Admission applications", description: "Admission application workflows are not connected in this release.", note: "Backend connection required", icon: UserPlus },
  Attendance: { heading: "Attendance management", description: "Take and review attendance by semester and department.", note: "Attendance management", icon: CalendarDays },
  Subscription: { heading: "Subscription", description: "Subscription management is not connected in this release.", note: "Backend connection required", icon: Wallet },
  Settings: { heading: "Workspace settings", description: "Workspace settings are not connected in this release.", note: "Backend connection required", icon: Settings },
  Support: { heading: "Help center", description: "Find guidance for setting up and managing your institute workspace.", note: "Help center", icon: LifeBuoy },
};

type PortalUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  instituteId: string | null;
};

type ApiError = { error?: string };

function suffix(value: number) {
  if (value % 100 >= 11 && value % 100 <= 13) return "th";
  return value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function statusLabel(status: StudentStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function Portal({ user, initialPage = "Overview" }: { user: PortalUser; initialPage?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [page, setPage] = useState(initialPage);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modal, setModal] = useState<"student" | "profile" | "delete" | "import" | null>(null);
  const [student, setStudent] = useState<StudentRecord | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<StudentListResponse | null>(null);
  const [institutes, setInstitutes] = useState<{ id: string; name: string }[]>([]);
  const [instituteId, setInstituteId] = useState(user.instituteId ?? "");
  const [institutesLoading, setInstitutesLoading] = useState(user.role === "SUPER_ADMIN" && !user.instituteId);
  const [semester, setSemester] = useState(1);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [sessionYear, setSessionYear] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMessage, setImportMessage] = useState("");
  const [importIssues, setImportIssues] = useState<{ row: number; reason: string }[]>([]);
  const [importPreviewed, setImportPreviewed] = useState(false);
  const [importTargetSemester, setImportTargetSemester] = useState("");
  const [importTargetDepartment, setImportTargetDepartment] = useState("");

  const semesters = useMemo(() => Array.from({ length: 8 }, (_, index) => `${index + 1}${suffix(index + 1)} Semester`), []);
  const departments = useMemo(() => [...new Set([
    ...POLYTECHNIC_DEPARTMENTS,
    ...(list?.departmentCounts ?? []).map((item) => item.department),
  ])].sort(), [list?.departmentCounts]);
  const sessionYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const configured = Array.from({ length: currentYear + 1 - SESSION_START_YEAR + 1 }, (_, index) => {
      const year = SESSION_START_YEAR + index;
      return [`${year}`, `${year}-${String(year + 1).slice(-2)}`];
    }).flat();
    return [...new Set([...(list?.sessionYears ?? []), ...configured])].sort((a, b) => b.localeCompare(a));
  }, [list?.sessionYears]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!modal) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setModal(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [modal, saving]);

  useEffect(() => {
    if (user.role !== "SUPER_ADMIN" || instituteId) return;
    let active = true;
    fetch("/api/institutes")
      .then(async (response) => {
        const body = await response.json() as { data?: { id: string; name: string }[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load institutes.");
        if (active) {
          setInstitutes(body.data ?? []);
          if (body.data?.[0]) setInstituteId(body.data[0].id);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load institutes.");
      })
      .finally(() => {
        if (active) setInstitutesLoading(false);
      });
    return () => { active = false; };
  }, [user.role, instituteId]);

  useEffect(() => {
    if (page !== "Overview" && page !== "Students") {
      return;
    }
    if (!instituteId) {
      if (user.role !== "SUPER_ADMIN") {
        const timer = window.setTimeout(() => {
          setLoading(false);
          setError("This account is not associated with an institute.");
        }, 0);
        return () => window.clearTimeout(timer);
      }
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          instituteId,
          page: String(pageNumber),
          pageSize: "20",
          semester: String(semester),
        });
        if (search.trim()) params.set("search", search.trim());
        if (department) params.set("department", department);
        if (sessionYear) params.set("sessionYear", sessionYear);
        const response = await fetch(`/api/students?${params}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as StudentListResponse & ApiError;
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) throw new Error(body.error ?? "Unable to load student records.");
        setList(body);
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") {
          setError(reason.message || "Unable to load student records.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [page, instituteId, pageNumber, semester, search, department, sessionYear, refreshKey, user.role, router]);

  async function responseError(response: Response) {
    const body = await response.json().catch(() => ({})) as ApiError;
    if (response.status === 401) router.replace("/login");
    return body.error ?? `Request failed (${response.status}).`;
  }

  function navigate(name: string) {
    setPage(name);
    setDrawerOpen(false);
    setSearch("");
    const target = name === "Public Profile"
      ? "/admin/public-profile"
      : name === "Pending Requests" || name === "Admission Applications"
        ? "/admin/pending-requests"
        : "/admin";
    if (pathname !== target) router.push(target);
  }

  function openStudent(value?: StudentRecord) {
    setStudent(value ?? null);
    setModal("student");
  }

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload = {
      ...values,
      instituteId,
      email: String(values.email ?? "").trim() || null,
      dateOfBirth: String(values.dateOfBirth ?? "").trim() || null,
      department: String(values.department ?? "").trim() || null,
    };
    try {
      const response = await fetch(student ? `/api/students/${student.id}` : "/api/students", {
        method: student ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setModal(null);
      setStudent(null);
      setPageNumber(1);
      setRefreshKey((key) => key + 1);
      setToast(student ? "Student updated successfully." : "Student added successfully.");
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "Unable to save student.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteStudent() {
    if (!student) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/students/${student.id}?instituteId=${encodeURIComponent(instituteId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setModal(null);
      setStudent(null);
      setRefreshKey((key) => key + 1);
      setToast("Student deactivated successfully.");
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "Unable to deactivate student.");
    } finally {
      setSaving(false);
    }
  }

  function startImport() {
    setImportFile(null);
    setImportMessage("");
    setImportIssues([]);
    setImportPreviewed(false);
    setImportTargetSemester("");
    setImportTargetDepartment("");
    setModal("import");
  }

  async function sendImport(preview: boolean) {
    if (!importTargetSemester || !importTargetDepartment) {
      setImportMessage("Select a semester and department before uploading a file.");
      return;
    }
    if (!importFile) {
      setImportMessage("Choose a CSV or Excel file first.");
      return;
    }
    setSaving(true);
    const form = new FormData();
    form.set("file", importFile);
    form.set("semester", importTargetSemester);
    form.set("department", importTargetDepartment);
    form.set("sessionYear", sessionYear);
    form.set("instituteId", instituteId);
    try {
      const response = await fetch(`/api/students/import${preview ? "?preview=1" : ""}`, {
        method: "POST",
        body: form,
      });
      const body = await response.json() as {
        error?: string;
        imported?: number;
        rejected?: number;
        valid?: number;
        issues?: { row: number; reason: string }[];
      };
      if (!response.ok && response.status !== 422) throw new Error(body.error ?? "Unable to process import.");
      setImportIssues(body.issues ?? []);
      if (preview) {
        setImportMessage(`${body.valid ?? 0} valid row(s) ready; ${body.rejected ?? 0} invalid or duplicate row(s) will be skipped.`);
        setImportPreviewed((body.valid ?? 0) > 0);
      } else {
        setModal(null);
        setPageNumber(1);
        setRefreshKey((key) => key + 1);
        setToast(`${body.imported ?? 0} student(s) imported. ${body.rejected ?? 0} row(s) skipped.`);
      }
    } catch (reason) {
      setImportMessage(reason instanceof Error ? reason.message : "Unable to process import.");
      setImportPreviewed(false);
    } finally {
      setSaving(false);
    }
  }

  function downloadTemplate() {
    const template = "name,roll,registration,phone,father_name,father_phone,mother_name,mother_phone,address,department,semester,session_year,email,date_of_birth\nExample Student,230999,2023-30999,+8801800000000,Father Name,+8801700000001,Mother Name,+8801700000002,Example address,Computer Technology,1,2024-25,student@example.edu.bd,2008-04-15\n";
    const href = URL.createObjectURL(new Blob([template], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = "eduportal-student-template.csv";
    link.click();
    URL.revokeObjectURL(href);
  }

  async function signOut() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error(await responseError(response));
      router.replace("/login");
      router.refresh();
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "Unable to sign out right now.");
    }
  }

  const currentPageInfo = pageDescriptions[page];
  const selectedSemesterCount = list?.semesterCounts.find((item) => item.semester === semester)?.count ?? 0;
  const selectedDepartmentCount = department
    ? list?.departmentCounts.find((item) => item.semester === semester && item.department === department)?.count ?? 0
    : selectedSemesterCount;
  const stats = [
    { label: "Total Students", value: loading ? "…" : String(list?.stats.totalStudents ?? 0), description: "All institute records", icon: Users },
    { label: "Active Students", value: loading ? "…" : String(list?.stats.activeStudents ?? 0), description: "Approved and active", icon: UserPlus },
    { label: "Semester / Department", value: loading ? "…" : String(selectedDepartmentCount), description: `${semester}${suffix(semester)} semester${department ? ` · ${department}` : ""}`, icon: Users },
  ];

  return (
    <div className="app">
      <aside className={`sidebar${drawerOpen ? " open" : ""}`} aria-label="Main navigation">
        <button className="brand" type="button" onClick={() => navigate("Overview")}>
          <span className="brand-mark"><GraduationCap aria-hidden="true" /></span>
          <span><span className="brand-name">AMRPI</span><span className="brand-caption">INSTITUTE WORKSPACE</span></span>
        </button>
        <div className="workspace-label">Workspace</div>
        <nav className="nav-list" aria-label="Workspace">
          {navigation.map(({ name, icon: Icon }) => (
            <button key={name} className={`nav-link${page === name ? " active" : ""}`} type="button" onClick={() => navigate(name)} aria-current={page === name ? "page" : undefined}>
              <span className="nav-icon"><Icon aria-hidden="true" /></span>{name}
              {name === "Pending Requests" && (list?.stats.pendingStudents ?? 0) > 0 && <span className="nav-badge">{list?.stats.pendingStudents}</span>}
            </button>
          ))}
        </nav>
        <div className="side-spacer" />
        <section className="support-card" aria-label="Help and support">
          <LifeBuoy aria-hidden="true" size={17} color="var(--green)" />
          <strong>Need a hand?</strong>
          <p>Find help with your institute workspace.</p>
          <button type="button" onClick={() => navigate("Support")}>Visit help center <span aria-hidden="true">→</span></button>
        </section>
        <div className="sidebar-bottom">
          <button className={`nav-link${page === "Settings" ? " active" : ""}`} type="button" onClick={() => navigate("Settings")}><span className="nav-icon"><Settings aria-hidden="true" /></span>Settings</button>
          <button className="nav-link" type="button" onClick={signOut}><span className="nav-icon"><LogOut aria-hidden="true" /></span>Sign out</button>
        </div>
      </aside>
      <button className={`backdrop${drawerOpen ? " show" : ""}`} type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} />
      <main className="main">
        <header className="topbar">
          <div className="top-left">
            <button className="icon-button menu-button" type="button" aria-label="Open navigation menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen((open) => !open)}><Menu size={18} /></button>
            <div className="crumb"><span>Workspace</span><span className="crumb-sep">/</span><strong>{page}</strong></div>
          </div>
          <div className="top-actions">
            <span className="status-pill"><span className="status-dot" />Database connected</span>
            <span className="website-link">Neon · PostgreSQL <ExternalLink size={14} /></span>
            <button className="icon-button" type="button" aria-label="Notifications are not connected" onClick={() => setToast("Notifications are not connected in this release.")}><Bell size={17} /></button>
            <button className="user-button" type="button" aria-label={`Signed in as ${user.name}`}>
              <span className="avatar">{initials(user.name)}</span><span className="user-meta"><strong>{user.name}</strong><span>{user.role.replaceAll("_", " ")}</span></span><ChevronDown size={15} />
            </button>
          </div>
        </header>
        <div className="content">
          <div className="demo-note"><span className="note-icon"><FileText size={15} /></span><span><strong>Live student directory</strong> — Student records are organized by semester and department in the connected institute database.</span></div>
          {user.role === "SUPER_ADMIN" && <div className="super-institute-select">
            <label htmlFor="activeInstitute">Institute workspace</label>
            <select id="activeInstitute" value={instituteId} disabled={institutesLoading || !institutes.length} onChange={(event) => { setInstituteId(event.target.value); setPageNumber(1); }}>
              {!institutes.length && <option value="">{institutesLoading ? "Loading institute workspaces…" : "No approved institute workspaces"}</option>}
              {institutes.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
            </select>
          </div>}
          {user.role === "SUPER_ADMIN" && !institutesLoading && !institutes.length && !error && (
            <div className="login-alert" role="status">
              No institute workspaces are available yet. Add or approve an institute before reviewing requests.
            </div>
          )}
          {error && <div className="login-alert" role="alert">{error}<button type="button" onClick={() => setRefreshKey((key) => key + 1)}>Retry</button></div>}

          {page === "Overview" || page === "Students" ? (
            <>
              <section className="page-heading">
                <div><div className="eyebrow">POLYTECHNIC / INSTITUTE WORKSPACE</div><h1>{page === "Overview" ? "Overview" : "Student directory"}</h1><p className="subtitle">Manage student records by semester and department.</p></div>
                <div className="heading-actions">
                  <button className="btn" type="button" onClick={startImport}><Download size={15} />Import students</button>
                  <button className="btn primary" type="button" onClick={() => openStudent()}><Plus size={15} />Add student</button>
                </div>
              </section>
                      <section className="stats-grid" aria-label="Institute statistics">
                {stats.map(({ label, value, description, icon: Icon }) => (
                  <article className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon aria-hidden="true" /></span></div><div className="stat-value">{value}</div><div className="stat-desc">{description}</div></article>
                ))}
              </section>
              <div className="dashboard-grid">
                <section className="panel semester-panel" aria-labelledby="semesterHeading">
                  <div className="panel-head"><div><h2 id="semesterHeading">Polytechnic semesters</h2><p>Select a semester to filter the student directory</p></div><span className="text-link">8 semesters</span></div>
                  <div className="semesters-grid">
                    {semesters.map((name, index) => (
                      <button key={name} className={`semester-card${semester === index + 1 ? " selected" : ""}`} type="button" onClick={() => { setSemester(index + 1); setDepartment(""); setPageNumber(1); }} aria-pressed={semester === index + 1}>
                        <div className="sem-top"><span className="sem-num">{name}</span><span className="sem-count">{list?.semesterCounts.find((item) => item.semester === index + 1)?.count ?? 0}</span></div><div className="sem-dept">students</div>
                      </button>
                    ))}
                  </div>
                  <div className="department-breakdown">
                    <span className="breakdown-label">{semester}{suffix(semester)} semester by department</span>
                    <div className="department-chips">
                      <button className={`department-chip${department === "" ? " selected" : ""}`} type="button" onClick={() => { setDepartment(""); setPageNumber(1); }}>
                        All departments <strong>{selectedSemesterCount}</strong>
                      </button>
                      {(list?.departmentCounts ?? []).filter((item) => item.semester === semester).map((item) => (
                        <button className={`department-chip${department === item.department ? " selected" : ""}`} key={item.department} type="button" onClick={() => { setDepartment(item.department); setPageNumber(1); }}>
                          {item.department} <strong>{item.count}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
              <section className="panel table-panel" aria-labelledby="studentsHeading">
                <div className="table-toolbar">
                  <div className="table-title"><h2 id="studentsHeading">{semester}{suffix(semester)} Semester students</h2><span className="record-count">{list?.pagination.total ?? 0} records</span></div>
                  <div className="directory-filters" aria-label="Filter student directory">
                    <label className="directory-filter">
                      <span>Semester</span>
                      <select aria-label="Filter by semester" value={semester} onChange={(event) => { setSemester(Number(event.target.value)); setDepartment(""); setPageNumber(1); }}>
                        {semesters.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
                      </select>
                    </label>
                    <label className="directory-filter">
                      <span>Department</span>
                      <select aria-label="Filter by department" value={department} onChange={(event) => { setDepartment(event.target.value); setPageNumber(1); }}>
                        <option value="">All technologies</option>
                        {departments.map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="directory-filter">
                      <span>Session</span>
                      <select aria-label="Filter by session year" value={sessionYear} onChange={(event) => { setSessionYear(event.target.value); setPageNumber(1); }}>
                        <option value="">All sessions</option>
                        {sessionYears.map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="directory-search">
                      <Search aria-hidden="true" />
                      <input className="search-input" type="search" placeholder="Search name, roll, or registration…" aria-label="Search name, roll, or registration" value={search} onChange={(event) => { setSearch(event.target.value); setPageNumber(1); }} />
                      {search && <button className="clear-search" type="button" aria-label="Clear search" onClick={() => { setSearch(""); setPageNumber(1); }}>×</button>}
                    </label>
                  </div>
                </div>
                <div className="table-scroll"><table><thead><tr><th>Student</th><th>Roll</th><th>Registration</th><th>Father&apos;s name</th><th>Mother&apos;s name</th><th>Phone number</th><th>Department</th><th>Session</th><th>Actions</th></tr></thead><tbody>
                  {loading ? <tr><td className="empty-row" colSpan={9}>Loading students…</td></tr> : list?.data.length ? list.data.map((record) => <tr key={record.id}>
                    <td><div className="student-cell"><span className="student-avatar">{initials(record.fullName || record.rollNumber || "?")}</span><span><span className="student-name">{record.fullName || "Name not provided"}</span><span className="student-email">{record.email ?? "No email provided"}</span></span></div></td>
                    <td>{record.rollNumber || "—"}</td><td>{record.registrationNumber || "—"}</td><td>{record.fatherName ?? "—"}</td><td>{record.motherName ?? "—"}</td><td>{record.studentPhone ?? "—"}</td><td>{record.department ?? "—"}</td><td>{record.sessionYear ?? "—"}</td>
                    <td><div className="row-actions">
                      <button className="row-action" type="button" aria-label={`View ${record.fullName || record.rollNumber || "student"}`} onClick={() => { setStudent(record); setModal("profile"); }}><Eye /></button>
                      <button className="row-action" type="button" aria-label={`Edit ${record.fullName || record.rollNumber || "student"}`} onClick={() => openStudent(record)}><FileText /></button>
                      <button className="row-action" type="button" aria-label={`Deactivate ${record.fullName || record.rollNumber || "student"}`} onClick={() => { setStudent(record); setModal("delete"); }}><Trash2 /></button>
                    </div></td>
                  </tr>) : <tr><td className="empty-row" colSpan={9}>{error ? "Unable to load student records." : "No student records match the selected semester and filters."}</td></tr>}
                </tbody></table></div>
                <div className="table-foot"><span>Showing {list?.data.length ? (pageNumber - 1) * 20 + 1 : 0}–{Math.min(pageNumber * 20, list?.pagination.total ?? 0)} of {list?.pagination.total ?? 0} students</span><span className="pagination"><button className="btn small" type="button" disabled={pageNumber <= 1 || loading} onClick={() => setPageNumber((current) => current - 1)}>Previous</button><span>Page {pageNumber} of {Math.max(1, list?.pagination.totalPages ?? 0)}</span><button className="btn small" type="button" disabled={loading || pageNumber >= (list?.pagination.totalPages ?? 0)} onClick={() => setPageNumber((current) => current + 1)}>Next</button></span></div>
              </section>
            </>
          ) : page === "Exam Results" ? (
            <ExamResultsModule instituteId={instituteId} departments={departments} />
          ) : page === "Attendance" ? (
            <AttendanceModule instituteId={instituteId} departments={departments} />
          ) : page === "Student Fees" ? (
            <StudentFeesAdmin key={instituteId} instituteId={instituteId} />
          ) : page === "Notice Board" ? (
            <NoticeBoardAdmin
              instituteId={instituteId}
              instituteName={institutes.find((option) => option.id === instituteId)?.name ?? "Institute"}
            />
          ) : page === "Public Profile" ? (
            <PublicProfileAdmin
              key={instituteId}
              instituteId={instituteId}
              instituteName={institutes.find((option) => option.id === instituteId)?.name ?? "Institute"}
            />
          ) : page === "Pending Requests" || page === "Admission Applications" ? (
            <PendingRequestsAdmin
              key={`${page}-${instituteId}`}
              instituteId={instituteId}
              initialTab={page === "Admission Applications" ? "applications" : "students"}
            />
          ) : currentPageInfo ? (
            <>
              <section className="page-heading"><div><div className="eyebrow">INSTITUTE WORKSPACE</div><h1>{currentPageInfo.heading}</h1><p className="subtitle">{currentPageInfo.description}</p></div></section>
              <section className="module-grid">
                <article className="module-card"><span className="stat-icon"><currentPageInfo.icon /></span><h3>{currentPageInfo.note}</h3><p>This module is not connected to the live database in the current release. Student records remain available in the Students module.</p><button className="btn small" type="button" onClick={() => setToast("This module needs a separate database integration.")}>Module status <ArrowUpRight size={14} /></button></article>
                <article className="module-card"><span className="stat-icon"><Users /></span><h3>Student directory</h3><p>Browse persisted students across eight semesters and departments.</p><button className="btn small" type="button" onClick={() => navigate("Students")}>View students <ArrowUpRight size={14} /></button></article>
                <article className="module-card"><span className="stat-icon"><Settings /></span><h3>Connected database</h3><p>Student CRUD and audit logging use the current Neon tables. Other modules are not yet wired to these records.</p><button className="btn small" type="button" onClick={() => setRefreshKey((key) => key + 1)}>Refresh data <FileText size={14} /></button></article>
              </section>
            </>
          ) : null}
        </div>
      </main>

      {modal && <div className="overlay open" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModal(null); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div className="modal-head"><div><h2 id="modalTitle">{modal === "student" ? student ? "Edit student" : "Add student" : modal === "profile" ? student?.fullName || student?.rollNumber || "Student profile" : modal === "delete" ? "Deactivate student?" : "Import students"}</h2><p>{modal === "student" ? "Changes are saved to the institute database." : modal === "profile" ? "Student profile · live record" : modal === "delete" ? "Deactivation retains academic history and can be reversed by an administrator." : "Validate the spreadsheet on the server before importing records."}</p></div><button className="icon-button" type="button" aria-label="Close dialog" disabled={saving} onClick={() => setModal(null)}><X size={17} /></button></div>
          {modal === "student" && <StudentForm key={student?.id ?? "new"} student={student} semester={semester} departments={departments} sessionYears={sessionYears} onSubmit={saveStudent} onCancel={() => setModal(null)} saving={saving} />}
          {modal === "profile" && student && <><div className="modal-body"><div className="profile-grid">
            {[
              ["Email", student.email ?? "Not provided"], ["Phone", student.studentPhone ?? "Not provided"], ["Roll number", student.rollNumber],
              ["Registration", student.registrationNumber || "Not provided"], ["Department", student.department ?? "—"],
              ["Semester", `${student.semester}${suffix(student.semester)} Semester`], ["Session", student.sessionYear ?? "Not provided"], ["Status", statusLabel(student.status)],
              ["Guardian", student.guardianName ?? "Not provided"], ["Guardian contact", student.guardianContact ?? "Not provided"],
              ["Father", student.fatherName ?? "Not provided"], ["Father's phone", student.fatherPhone ?? "Not provided"],
              ["Mother", student.motherName ?? "Not provided"], ["Mother's phone", student.motherPhone ?? "Not provided"],
              ["Date of birth", student.dateOfBirth ?? "Not provided"], ["Address", student.address ?? "Not provided"],
            ].map(([label, value]) => <div className="profile-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div></div><div className="modal-foot"><button className="btn" type="button" onClick={() => setModal(null)}>Close</button><button className="btn primary" type="button" onClick={() => setModal("student")}>Edit student</button></div></>}
          {modal === "delete" && student && <><div className="modal-body"><div className="callout">This will mark <strong>{student.fullName || student.rollNumber || "this student"}</strong> inactive. The record, results and attendance history remain in the database. You can later restore the student by editing the record status.</div></div><div className="modal-foot"><button className="btn" type="button" disabled={saving} onClick={() => setModal(null)}>Cancel</button><button className="btn danger" type="button" disabled={saving} onClick={deleteStudent}>{saving ? "Deactivating…" : "Deactivate student"}</button></div></>}
          {modal === "import" && <><div className="modal-body">
            <div className="form-grid">
              <div className="field"><label htmlFor="importSemester">Target semester *</label><select id="importSemester" required value={importTargetSemester} onChange={(event) => { setImportTargetSemester(event.target.value); setImportPreviewed(false); setImportMessage(""); setImportIssues([]); }}><option value="">Select a semester</option>{semesters.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></div>
              <div className="field"><label htmlFor="importDepartment">Target department *</label><select id="importDepartment" required value={importTargetDepartment} onChange={(event) => { setImportTargetDepartment(event.target.value); setImportPreviewed(false); setImportMessage(""); setImportIssues([]); }}><option value="">Select a department</option>{departments.map((value) => <option key={value}>{value}</option>)}</select></div>
            </div>
            <div className="callout">All imported students will be assigned to <strong>{importTargetSemester ? `${importTargetSemester}${suffix(Number(importTargetSemester))} Semester` : "the selected semester"}</strong>{importTargetDepartment ? <> · <strong>{importTargetDepartment}</strong></> : " · the selected department"}. Semester and department columns in the file do not override these choices.</div>
            <div className="field"><label htmlFor="csvFile">CSV or XLSX file *</label><input id="csvFile" type="file" disabled={!importTargetSemester || !importTargetDepartment} accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event: ChangeEvent<HTMLInputElement>) => { setImportFile(event.target.files?.[0] ?? null); setImportPreviewed(false); setImportMessage(""); setImportIssues([]); }} /><small>{importTargetSemester && importTargetDepartment ? "Maximum 5 MB and 500 rows. Legacy XLS, formulas and macros are not accepted." : "Choose the target semester and department before selecting a file."}</small></div>
            {importMessage && <div className="callout" role="status">{importMessage}</div>}
            {importIssues.length > 0 && <div className="import-issues"><strong>Rows needing review</strong>{importIssues.slice(0, 10).map((issue) => <span key={issue.row}>Row {issue.row}: {issue.reason}</span>)}{importIssues.length > 10 && <span>And {importIssues.length - 10} more invalid rows.</span>}</div>}
            <button className="btn small" type="button" onClick={downloadTemplate}><Download size={14} />Download CSV template</button>
          </div><div className="modal-foot"><button className="btn" type="button" disabled={saving} onClick={() => setModal(null)}>Cancel</button>{importPreviewed ? <button className="btn primary" type="button" disabled={saving} onClick={() => void sendImport(false)}>{saving ? "Importing…" : "Import valid rows"}</button> : <button className="btn primary" type="button" disabled={saving || !importFile || !importTargetSemester || !importTargetDepartment} onClick={() => void sendImport(true)}>{saving ? "Validating…" : "Preview import"}</button>}</div></>}
        </section>
      </div>}
      <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite"><Check size={16} />{toast}</div>
    </div>
  );
}

type AttendanceStudent = {
  id: string;
  fullName: string | null;
  rollNumber: string | null;
  status: "present" | "absent" | null;
};

type AttendanceHistoryItem = {
  id: string;
  studentId: string;
  attendanceDate: string;
  semester: number;
  department: string;
  studentName: string | null;
  rollNumber: string | null;
  status: "present" | "absent";
  markedAt: string;
};

type ExamSubject = {
  id: string;
  semester: number;
  department: string;
  code: string | null;
  name: string;
  credits: number;
  maximumMarks: number;
  isPreset: boolean;
};

type ExamStudent = {
  id: string;
  fullName: string | null;
  rollNumber: string | null;
  marks: number | null;
  examFullMarks: number;
};

function ExamResultsModule({ instituteId, departments }: { instituteId: string; departments: string[] }) {
  const [semester, setSemester] = useState(1);
  const [department, setDepartment] = useState("");
  const [departmentOptions, setDepartmentOptions] = useState<string[]>(departments);
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<ExamSubject | null>(null);
  const [students, setStudents] = useState<ExamStudent[]>([]);
  const [resultInputs, setResultInputs] = useState<Record<string, string>>({});
  const [examName, setExamName] = useState("Final Examination");
  const [examYear, setExamYear] = useState(String(new Date().getFullYear()));
  const [examFullMarks, setExamFullMarks] = useState("100");
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [savingResults, setSavingResults] = useState(false);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);
  const [moduleError, setModuleError] = useState("");
  const [moduleMessage, setModuleMessage] = useState("");
  const [refreshSubjects, setRefreshSubjects] = useState(0);
  const [refreshRoster, setRefreshRoster] = useState(0);

  const semesters = useMemo(() => Array.from({ length: 8 }, (_, index) => `${index + 1}${suffix(index + 1)} Semester`), []);
  const departmentChoices = useMemo(
    () => [...new Set([...departments, ...departmentOptions].map(canonicalDepartmentLabel))].sort(),
    [departments, departmentOptions],
  );

  useEffect(() => {
    if (!instituteId) return;
    const controller = new AbortController();
    const loadDepartments = async () => {
      try {
        const params = new URLSearchParams({ mode: "departments", instituteId, semester: String(semester) });
        const response = await fetch(`/api/exam-results?${params}`, { signal: controller.signal });
        const body = await response.json() as { data?: string[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load departments.");
        if (controller.signal.aborted) return;
        setDepartmentOptions(body.data ?? []);
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") setModuleError(reason.message);
      }
    };
    void loadDepartments();
    return () => controller.abort();
  }, [instituteId, semester]);

  useEffect(() => {
    if (!instituteId || !department) {
      const timer = window.setTimeout(() => {
        setSubjects([]);
        setSelectedSubject(null);
        setStudents([]);
        setModuleError("");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingSubjects(true);
      setModuleError("");
      setModuleMessage("");
      setSelectedSubject(null);
      setStudents([]);
      try {
        const params = new URLSearchParams({
          mode: "subjects",
          instituteId,
          semester: String(semester),
          department,
          catalogVersion: String(refreshSubjects),
        });
        const response = await fetch(`/api/exam-results?${params}`, { signal: controller.signal });
        const body = await response.json() as { data?: ExamSubject[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load subjects.");
        if (controller.signal.aborted) return;
        setSubjects(body.data ?? []);
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") setModuleError(reason.message);
      } finally {
        if (!controller.signal.aborted) setLoadingSubjects(false);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [instituteId, semester, department, refreshSubjects]);

  useEffect(() => {
    if (!instituteId || !selectedSubject || !examName.trim() || !/^\d{4}$/.test(examYear)) {
      const timer = window.setTimeout(() => {
        setStudents([]);
        setResultInputs({});
        setLoadingRoster(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStudents([]);
      setResultInputs({});
      setLoadingRoster(true);
      setModuleError("");
      try {
        const params = new URLSearchParams({
          mode: "roster",
          instituteId,
          subjectId: selectedSubject.id,
          examName: examName.trim(),
          examYear,
        });
        const response = await fetch(`/api/exam-results?${params}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as { data?: ExamStudent[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load the student roster.");
        if (controller.signal.aborted) return;
        const roster = body.data ?? [];
        setStudents(roster);
        const savedFullMarks = roster.find((student) => student.marks !== null)?.examFullMarks;
        if (savedFullMarks) setExamFullMarks(String(savedFullMarks));
        setResultInputs(Object.fromEntries(roster.map((student) => [
          student.id,
          student.marks === null ? "" : String(student.marks),
        ])));
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") {
          setModuleError(reason.message);
          setStudents([]);
          setResultInputs({});
        }
      } finally {
        if (!controller.signal.aborted) setLoadingRoster(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [instituteId, selectedSubject, examName, examYear, refreshRoster]);

  async function addSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!department) {
      setModuleError("Select a department before adding a subject.");
      return;
    }
    setSavingSubject(true);
    setModuleError("");
    setModuleMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch("/api/exam-results", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "createSubject",
          instituteId,
          semester,
          department,
          name: values.subjectName,
          code: values.subjectCode,
          maximumMarks: values.maximumMarks,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to add subject.");
      setShowAddSubject(false);
      setModuleMessage("Subject added to this semester and department.");
      setRefreshSubjects((value) => value + 1);
    } catch (reason) {
      setModuleError(reason instanceof Error ? reason.message : "Unable to add subject.");
    } finally {
      setSavingSubject(false);
    }
  }

  async function publishResults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSubject || !students.length) return;
    setSavingResults(true);
    setModuleError("");
    setModuleMessage("");
    try {
      const response = await fetch("/api/exam-results", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "publishResults",
          instituteId,
          subjectId: selectedSubject.id,
          examName,
          examYear,
          examFullMarks,
          records: students.map((student) => ({
            studentId: student.id,
            marks: resultInputs[student.id] || null,
          })),
        }),
      });
      const body = await response.json() as { published?: number; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to publish results.");
      setModuleMessage(`${body.published ?? students.length} result(s) published for ${selectedSubject.name}.`);
      setRefreshRoster((value) => value + 1);
    } catch (reason) {
      setModuleError(reason instanceof Error ? reason.message : "Unable to publish results.");
    } finally {
      setSavingResults(false);
    }
  }

  return <div className="exam-results-page">
    <section className="page-heading"><div><div className="eyebrow">ACADEMIC RECORDS</div><h1>Exam results</h1><p className="subtitle">Select a semester, department, and subject to enter and publish results.</p></div></section>
    <section className="panel exam-selector">
      <div className="panel-head"><div><h2>Select semester</h2><p>Choose the academic semester to see its departments and subjects.</p></div></div>
      <div className="exam-semesters" aria-label="Exam semester selection">
        {semesters.map((name, index) => {
          const value = index + 1;
          return <button key={name} className={`semester-card${semester === value ? " selected" : ""}`} type="button" aria-pressed={semester === value} onClick={() => { setSemester(value); setDepartment(""); setDepartmentOptions([]); setSubjects([]); setSelectedSubject(null); setStudents([]); setResultInputs({}); setModuleError(""); setModuleMessage(""); }}>
            <span className="semester-number">{value}</span><strong>{name}</strong>
          </button>;
        })}
      </div>
      <div className="exam-department-bar">
        <label className="field"><span>Department / technology</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setSubjects([]); setSelectedSubject(null); setStudents([]); setResultInputs({}); setModuleError(""); setModuleMessage(""); }}><option value="">Select a department</option>{departmentChoices.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
    </section>

    {moduleError && <div className="callout attendance-notice" role="alert">{moduleError}</div>}
    {moduleMessage && <div className="callout attendance-success" role="status">{moduleMessage}</div>}

    {department && <section className="panel exam-subject-panel">
      <div className="panel-head"><div><h2>Subjects · {semester}{suffix(semester)} Semester</h2><p>{department} · {subjects.length} subject(s) available</p></div><button className="btn primary small" type="button" onClick={() => setShowAddSubject((open) => !open)}><Plus size={14} />Add subject</button></div>
      {subjects.some((subject) => subject.code?.startsWith("DEF-")) && <div className="callout attendance-notice" role="note">Generated default subjects and DEF codes are starter references, not official BTEB curriculum entries. Verify them against your institute’s applicable syllabus before publishing results.</div>}
      {showAddSubject && <form className="exam-add-subject" onSubmit={(event) => void addSubject(event)}>
        <label className="field"><span>Subject name *</span><input name="subjectName" maxLength={160} required placeholder="e.g. Applied Mathematics" /></label>
        <label className="field"><span>Subject code *</span><input name="subjectCode" maxLength={40} required placeholder="e.g. 25911" /></label>
        <label className="field"><span>Maximum marks</span><input name="maximumMarks" type="number" min="0.01" max="9999.99" step="0.01" defaultValue="100" required /></label>
        <div className="exam-add-actions"><button className="btn small" type="button" disabled={savingSubject} onClick={() => setShowAddSubject(false)}>Cancel</button><button className="btn primary small" type="submit" disabled={savingSubject}>{savingSubject ? "Saving…" : "Save subject"}</button></div>
      </form>}
      {loadingSubjects ? <div className="empty-row">Loading semester subjects…</div> : subjects.length ? <div className="exam-subject-grid">
        {subjects.map((subject) => <button key={subject.id} className={`exam-subject-card${selectedSubject?.id === subject.id ? " selected" : ""}`} type="button" aria-pressed={selectedSubject?.id === subject.id} onClick={() => { setSelectedSubject(subject); setExamFullMarks(String(subject.maximumMarks)); setStudents([]); setResultInputs({}); setLoadingRoster(true); setModuleError(""); setModuleMessage(""); }}>
          <span className="exam-subject-kind">{subject.isPreset ? "Preset subject" : "Custom subject"}</span><strong>{subject.name}</strong><span>{subject.code || "No subject code"} · Max {subject.maximumMarks}</span>
        </button>)}
      </div> : <div className="exam-empty-subjects">No subjects are configured for this semester and department yet. Add a subject to start entering results.</div>}
    </section>}

    {selectedSubject && <section className="panel exam-entry-panel">
      <div className="panel-head exam-entry-head"><div><h2>{selectedSubject.name}</h2><p>{selectedSubject.code || "No code"} · maximum marks {selectedSubject.maximumMarks} · {department}</p></div>
        <div className="exam-identity-fields">
          <label className="field"><span>Exam type</span><select value={examName} onChange={(event) => { setExamName(event.target.value); setStudents([]); setResultInputs({}); setLoadingRoster(true); }}><option>Final Examination</option><option>Midterm Exam</option><option>Class Test</option></select></label>
          <label className="field"><span>Exam year</span><input type="number" min="1900" max="9999" required value={examYear} onChange={(event) => { setExamYear(event.target.value); setStudents([]); setResultInputs({}); setLoadingRoster(true); }} /></label>
          <label className="field"><span>Full marks</span><input type="number" min="0.01" max="9999.99" step="0.01" required value={examFullMarks} onChange={(event) => setExamFullMarks(event.target.value)} /></label>
        </div>
      </div>
      <form onSubmit={(event) => void publishResults(event)}>
        <div className="exam-entry-note">Enter each student&apos;s marks out of {examFullMarks || "—"}. Publishing updates results for the selected exam type and year.</div>
        <div className="table-scroll"><table className="exam-results-table"><thead><tr><th>Roll number</th><th>Student name</th><th>Marks / {examFullMarks || "—"}</th></tr></thead><tbody>
          {loadingRoster ? <tr><td className="empty-row" colSpan={3}>Loading students…</td></tr> : students.length ? students.map((student) => <tr key={student.id}>
            <td>{student.rollNumber || "—"}</td><td>{student.fullName || "Name not provided"}</td>
            <td><input aria-label={`Marks for ${student.fullName || student.rollNumber || "student"}`} type="number" min="0" max={Number(examFullMarks) || undefined} step="0.01" required value={resultInputs[student.id] ?? ""} onChange={(event) => setResultInputs((current) => ({ ...current, [student.id]: event.target.value }))} /></td>
          </tr>) : <tr><td className="empty-row" colSpan={3}>No active, approved students are enrolled in this semester and department.</td></tr>}
        </tbody></table></div>
        <div className="table-foot exam-results-foot"><span>{students.length} enrolled student(s)</span><button className="btn primary" type="submit" disabled={savingResults || loadingRoster || !students.length || !examName || !(Number(examFullMarks) > 0) || !/^\d{4}$/.test(examYear)}>{savingResults ? "Publishing…" : "Publish results"}</button></div>
      </form>
    </section>}
  </div>;
}

function localDateString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function AttendanceModule({ instituteId, departments }: { instituteId: string; departments: string[] }) {
  const [semester, setSemester] = useState(1);
  const [department, setDepartment] = useState("");
  const [date, setDate] = useState(localDateString);
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [sheetRefresh, setSheetRefresh] = useState(0);
  const [history, setHistory] = useState<AttendanceHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);
  const [historyDate, setHistoryDate] = useState("");
  const [historyMonth, setHistoryMonth] = useState("");
  const [historySemester, setHistorySemester] = useState("");
  const [historyDepartment, setHistoryDepartment] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRefresh, setHistoryRefresh] = useState(0);

  useEffect(() => {
    if (!instituteId || !department) {
      const timer = window.setTimeout(() => {
        setStudents([]);
        setAttendanceError("");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setAttendanceError("");
      setAttendanceMessage("");
      try {
        const params = new URLSearchParams({
          instituteId,
          semester: String(semester),
          department,
          date,
        });
        const response = await fetch(`/api/attendance?${params}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as { data?: AttendanceStudent[]; error?: string };
        if (response.status === 401) throw new Error("Your session has expired. Sign in again to continue.");
        if (!response.ok) throw new Error(body.error ?? "Unable to load attendance sheet.");
        setStudents(body.data ?? []);
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") {
          setAttendanceError(reason.message);
          setStudents([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [instituteId, semester, department, date, sheetRefresh]);

  useEffect(() => {
    if (!instituteId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const params = new URLSearchParams({ instituteId, mode: "history", page: String(historyPage) });
        if (historyDate) params.set("date", historyDate);
        if (historyMonth) params.set("month", historyMonth);
        if (historySemester) params.set("semester", historySemester);
        if (historyDepartment) params.set("department", historyDepartment);
        if (historySearch.trim()) params.set("search", historySearch.trim());
        const response = await fetch(`/api/attendance?${params}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as {
          data?: AttendanceHistoryItem[];
          pagination?: { total: number; totalPages: number };
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "Unable to load attendance history.");
        setHistory(body.data ?? []);
        setHistoryTotal(body.pagination?.total ?? 0);
        setHistoryTotalPages(body.pagination?.totalPages ?? 0);
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") {
          setHistoryError(reason.message);
          setHistory([]);
          setHistoryTotal(0);
          setHistoryTotalPages(0);
        }
      } finally {
        if (!controller.signal.aborted) setHistoryLoading(false);
      }
    }, historySearch ? 200 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [instituteId, historyDate, historyMonth, historySemester, historyDepartment, historySearch, historyPage, historyRefresh]);

  function setAllStudents(status: "present" | "absent") {
    setStudents((current) => current.map((student) => ({ ...student, status })));
  }

  async function saveAttendance() {
    if (!department || !students.length || students.some((student) => !student.status)) {
      setAttendanceError("Select Present or Absent for every enrolled student before saving.");
      return;
    }
    setSaving(true);
    setAttendanceError("");
    setAttendanceMessage("");
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instituteId,
          semester,
          department,
          date,
          records: students.map((student) => ({ studentId: student.id, status: student.status })),
        }),
      });
      const body = await response.json() as { saved?: number; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to save attendance.");
      setAttendanceMessage(`${body.saved ?? students.length} attendance record(s) saved for ${date}.`);
      setSheetRefresh((value) => value + 1);
      setHistoryPage(1);
      setHistoryRefresh((value) => value + 1);
    } catch (reason) {
      setAttendanceError(reason instanceof Error ? reason.message : "Unable to save attendance.");
    } finally {
      setSaving(false);
    }
  }

  const markedCount = students.filter((student) => student.status).length;
  const allMarked = students.length > 0 && markedCount === students.length;

  return <div className="attendance-page">
    <section className="page-heading"><div><div className="eyebrow">STUDENT RECORDS</div><h1>Attendance management</h1><p className="subtitle">Take and review daily attendance by semester and department.</p></div></section>
    <section className="panel attendance-selector">
      <div className="panel-head"><div><h2>Select semester</h2><p>Choose the semester to load its enrolled students.</p></div></div>
      <div className="attendance-semesters" aria-label="Attendance semester selection">
        {Array.from({ length: 8 }, (_, index) => {
          const value = index + 1;
          return <button key={value} className={`semester-card${semester === value ? " selected" : ""}`} type="button" aria-pressed={semester === value} onClick={() => { setSemester(value); setDepartment(""); setStudents([]); }}>
            <span className="semester-number">{value}</span><strong>{value}{suffix(value)}</strong><span>Semester</span>
          </button>;
        })}
      </div>
      <div className="attendance-controls">
        <label className="field"><span>Department</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">Select a department</option>{departments.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="field"><span>Attendance date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      </div>
    </section>

    <section className="panel attendance-sheet">
      <div className="panel-head attendance-sheet-head">
        <div><h2>Attendance sheet</h2><p>{department ? `${semester}${suffix(semester)} Semester · ${department} · ${date}` : "Choose a department to load the student list."}</p></div>
        <div className="attendance-actions">
          <button className="btn small" type="button" disabled={!students.length || loading || saving} onClick={() => setAllStudents("present")}><CheckCircle2 size={14} />Mark all present</button>
          <button className="btn small" type="button" disabled={!students.length || loading || saving} onClick={() => setAllStudents("absent")}><XCircle size={14} />Mark all absent</button>
        </div>
      </div>
      {attendanceError && <div className="callout attendance-notice" role="alert">{attendanceError}</div>}
      {attendanceMessage && <div className="callout attendance-success" role="status">{attendanceMessage}</div>}
      <div className="table-scroll"><table className="attendance-table"><thead><tr><th>Roll number</th><th>Student name</th><th>Attendance</th></tr></thead><tbody>
        {loading ? <tr><td className="empty-row" colSpan={3}>Loading enrolled students…</td></tr> : !department ? <tr><td className="empty-row" colSpan={3}>Select a department to begin taking attendance.</td></tr> : students.length ? students.map((student) => {
          const name = student.fullName || "Name not provided";
          return <tr key={student.id}><td>{student.rollNumber || "—"}</td><td>{name}</td><td><div className="attendance-choice">
            <label className={student.status === "present" ? "selected present" : ""}><input type="radio" name={`attendance-${student.id}`} checked={student.status === "present"} onChange={() => setStudents((current) => current.map((row) => row.id === student.id ? { ...row, status: "present" } : row))} /><CheckCircle2 size={15} />Present</label>
            <label className={student.status === "absent" ? "selected absent" : ""}><input type="radio" name={`attendance-${student.id}`} checked={student.status === "absent"} onChange={() => setStudents((current) => current.map((row) => row.id === student.id ? { ...row, status: "absent" } : row))} /><XCircle size={15} />Absent</label>
          </div></td></tr>;
        }) : <tr><td className="empty-row" colSpan={3}>No active, approved students are enrolled in this semester and department.</td></tr>}
      </tbody></table></div>
      <div className="table-foot attendance-foot"><span>{markedCount} of {students.length} students marked</span><button className="btn primary" type="button" disabled={!allMarked || saving || loading} onClick={() => void saveAttendance()}>{saving ? "Saving attendance…" : "Save attendance"}</button></div>
    </section>

    <section className="panel attendance-history">
      <div className="panel-head"><div><h2>Attendance history</h2><p>Review saved records by date, month, semester, department, name, or roll.</p></div></div>
      <div className="attendance-history-filters">
        <label className="field"><span>Specific date</span><input type="date" value={historyDate} onChange={(event) => { setHistoryDate(event.target.value); setHistoryPage(1); }} /></label>
        <label className="field"><span>Month</span><input type="month" value={historyMonth} onChange={(event) => { setHistoryMonth(event.target.value); setHistoryPage(1); }} /></label>
        <label className="field"><span>Semester</span><select value={historySemester} onChange={(event) => { setHistorySemester(event.target.value); setHistoryPage(1); }}><option value="">All semesters</option>{Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}{suffix(index + 1)} Semester</option>)}</select></label>
        <label className="field"><span>Department</span><select value={historyDepartment} onChange={(event) => { setHistoryDepartment(event.target.value); setHistoryPage(1); }}><option value="">All departments</option>{departments.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="field history-search"><span>Name or roll</span><input type="search" placeholder="Search attendance…" value={historySearch} onChange={(event) => { setHistorySearch(event.target.value); setHistoryPage(1); }} /></label>
        <button className="btn small" type="button" disabled={historyLoading} onClick={() => setHistoryRefresh((value) => value + 1)}>Refresh</button>
      </div>
      {historyError && <div className="callout attendance-notice" role="alert">{historyError}</div>}
      <div className="table-scroll"><table className="attendance-table history-table"><thead><tr><th>Date</th><th>Semester</th><th>Department</th><th>Roll number</th><th>Student name</th><th>Status</th><th>Saved at</th></tr></thead><tbody>
        {historyLoading ? <tr><td className="empty-row" colSpan={7}>Loading attendance history…</td></tr> : history.length ? history.map((record) => <tr key={record.id}>
          <td>{record.attendanceDate}</td><td>{record.semester}{suffix(record.semester)}</td><td>{record.department}</td><td>{record.rollNumber || "—"}</td><td>{record.studentName || "Name not provided"}</td><td><span className={`attendance-status ${record.status}`}>{record.status}</span></td><td>{new Date(record.markedAt).toLocaleString()}</td>
        </tr>) : <tr><td className="empty-row" colSpan={7}>No attendance records match these filters.</td></tr>}
      </tbody></table></div>
      <div className="table-foot"><span>Showing {history.length ? (historyPage - 1) * 100 + 1 : 0}–{Math.min(historyPage * 100, historyTotal)} of {historyTotal} attendance records</span><span className="pagination"><button className="btn small" type="button" disabled={historyPage <= 1 || historyLoading} onClick={() => setHistoryPage((current) => current - 1)}>Previous</button><span>Page {historyPage} of {Math.max(1, historyTotalPages)}</span><button className="btn small" type="button" disabled={historyLoading || historyPage >= historyTotalPages} onClick={() => setHistoryPage((current) => current + 1)}>Next</button></span></div>
    </section>
  </div>;
}

function StudentForm({
  student,
  semester,
  departments,
  sessionYears,
  onSubmit,
  onCancel,
  saving,
}: {
  student: StudentRecord | null;
  semester: number;
  departments: string[];
  sessionYears: string[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return <form onSubmit={onSubmit}>
    <div className="modal-body"><div className="form-grid">
      <Field name="fullName" label="Student name" defaultValue={student?.fullName ?? ""} />
      <Field name="email" label="Email address" type="email" defaultValue={student?.email ?? ""} />
      <Field name="rollNumber" label="Roll number" defaultValue={student?.rollNumber ?? ""} />
      <Field name="registrationNumber" label="Registration number" defaultValue={student?.registrationNumber ?? ""} />
      <Field name="studentPhone" label="Phone number" defaultValue={student?.studentPhone ?? ""} />
      <Field name="fatherName" label="Father's name" defaultValue={student?.fatherName ?? ""} />
      <Field name="motherName" label="Mother's name" defaultValue={student?.motherName ?? ""} />
      <Field name="fatherPhone" label="Father's phone" defaultValue={student?.fatherPhone ?? ""} />
      <Field name="motherPhone" label="Mother's phone" defaultValue={student?.motherPhone ?? ""} />
      <div className="field"><label htmlFor="department">Department</label><input id="department" name="department" list="student-departments" maxLength={100} defaultValue={student?.department ?? ""} /><datalist id="student-departments">{departments.map((value) => <option value={value} key={value} />)}</datalist></div>
      <div className="field"><label htmlFor="semester">Semester</label><select id="semester" name="semester" defaultValue={student?.semester ?? semester}>{Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}{suffix(index + 1)} Semester</option>)}</select></div>
      <div className="field"><label htmlFor="sessionYear">Session year</label><input id="sessionYear" name="sessionYear" list="student-session-years" maxLength={20} placeholder="e.g. 2024-25" defaultValue={student?.sessionYear ?? ""} /><datalist id="student-session-years">{sessionYears.map((value) => <option value={value} key={value} />)}</datalist></div>
      <div className="field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={student?.status ?? "active"}><option value="active">Active</option><option value="inactive">Inactive</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select></div>
      <Field name="guardianName" label="Guardian name" defaultValue={student?.guardianName ?? ""} />
      <Field name="guardianContact" label="Guardian phone" defaultValue={student?.guardianContact ?? ""} />
      <Field name="dateOfBirth" label="Date of birth" type="date" defaultValue={student?.dateOfBirth ?? ""} />
      <div className="field full"><label htmlFor="address">Address</label><input id="address" name="address" maxLength={500} defaultValue={student?.address ?? ""} /></div>
    </div></div>
    <div className="modal-foot"><button className="btn" type="button" disabled={saving} onClick={onCancel}>Cancel</button><button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : student ? "Save changes" : "Add student"}</button></div>
  </form>;
}

function Field({
  name,
  label,
  required = false,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
}) {
  const maxLength = name === "email" ? 254 : ["studentPhone", "guardianContact", "fatherPhone", "motherPhone"].includes(name) ? 30 : name === "rollNumber" ? 40 : name === "registrationNumber" ? 80 : name === "dateOfBirth" ? 10 : 160;
  return <div className="field"><label htmlFor={name}>{label}{required ? " *" : ""}</label><input id={name} name={name} type={type} defaultValue={defaultValue} required={required} maxLength={maxLength} /></div>;
}
