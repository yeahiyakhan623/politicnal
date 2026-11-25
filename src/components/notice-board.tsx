"use client";

import Image from "next/image";
import { FileText, ImagePlus, Upload } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { InstituteNotice } from "@/lib/notices/types";

const CATEGORIES = ["Academic", "Examination", "Admission", "Administrative", "Scholarship", "Other"];

type AdminCircular = {
  id: string;
  title: string;
  body: string;
  applicationDeadline: string | null;
  publishedAt: string;
};

function todayDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function NoticeCard({ notice }: { notice: InstituteNotice }) {
  return notice.format === "document" ? (
    <article className="notice-document">
      <header className="notice-card-meta">
        <span className="notice-category">{notice.category}</span>
        <time dateTime={notice.noticeDate}>{displayDate(notice.noticeDate)}</time>
      </header>
      <div className="notice-document-body">
        <div className="notice-official-mark"><FileText size={22} aria-hidden="true" /><span>OFFICIAL NOTICE</span></div>
        <h3>{notice.title}</h3>
        <div className="notice-document-copy">{notice.description}</div>
      </div>
    </article>
  ) : (
    <article className="notice-image-card">
      <header className="notice-card-meta">
        <div><span className="notice-category">{notice.category}</span><h3>{notice.title}</h3></div>
        <time dateTime={notice.noticeDate}>{displayDate(notice.noticeDate)}</time>
      </header>
      {notice.attachmentMimeType?.startsWith("image/") ? (
        <a className="notice-image-link" href={`/api/notices/${notice.id}/file`} target="_blank" rel="noreferrer" aria-label={`Open ${notice.title}`}>
          <Image
            src={`/api/notices/${notice.id}/file`}
            alt={notice.title}
            width={1200}
            height={900}
            unoptimized
            className="notice-image-preview"
          />
        </a>
      ) : (
        <div className="notice-pdf-preview"><FileText size={34} aria-hidden="true" /><strong>PDF notice</strong><span>{notice.attachmentName}</span><a href={`/api/notices/${notice.id}/file`} target="_blank" rel="noreferrer">View PDF</a></div>
      )}
      {notice.description && <p className="notice-image-description">{notice.description}</p>}
      <a className="btn small notice-download" href={`/api/notices/${notice.id}/file?download=1`} download>{notice.attachmentMimeType === "application/pdf" ? "Download PDF" : "Download image"}</a>
    </article>
  );
}

export function NoticeFeed({
  instituteId,
  title = "Notice board",
  subtitle = "Official institute announcements and published notices.",
}: {
  instituteId: string;
  title?: string;
  subtitle?: string;
}) {
  const [notices, setNotices] = useState<InstituteNotice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!instituteId) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      setNotices([]);
      try {
        const params = new URLSearchParams({ instituteId });
        const response = await fetch(`/api/notices?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json() as { data?: InstituteNotice[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load notices.");
        setNotices(body.data ?? []);
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") {
          setError(reason.message);
          setNotices([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [instituteId]);

  return (
    <section className="notice-feed" aria-label={title}>
      <div className="notice-feed-heading"><div><div className="eyebrow">INSTITUTE ANNOUNCEMENTS</div><h2>{title}</h2><p>{subtitle}</p></div></div>
      {!instituteId && <div className="login-alert" role="alert">An institute must be selected to view notices.</div>}
      {instituteId && error && <div className="login-alert" role="alert">{error}</div>}
      {instituteId && loading ? <div className="notice-feed-empty" role="status">Loading notices…</div>
        : instituteId && notices.length ? <div className="notice-feed-grid">{notices.map((notice) => <NoticeCard key={notice.id} notice={notice} />)}</div>
          : instituteId && !loading && !error && <div className="notice-feed-empty">There are no published notices yet.</div>}
    </section>
  );
}

export function NoticeBoardAdmin({
  instituteId,
  instituteName,
}: {
  instituteId: string;
  instituteName: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const circularFormRef = useRef<HTMLFormElement>(null);
  const [format, setFormat] = useState<"document" | "image">("document");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [circulars, setCirculars] = useState<AdminCircular[]>([]);
  const [circularSaving, setCircularSaving] = useState(false);
  const [circularMessage, setCircularMessage] = useState("");
  const [circularError, setCircularError] = useState("");
  const [refreshCirculars, setRefreshCirculars] = useState(0);

  useEffect(() => {
    if (!instituteId) return;
    const controller = new AbortController();
    const loadCirculars = async () => {
      try {
        const params = new URLSearchParams({ instituteId });
        const response = await fetch(`/api/public/admissions?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json() as { data?: AdminCircular[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load admission circulars.");
        setCirculars(body.data ?? []);
      } catch (reason) {
        if (reason instanceof Error && reason.name !== "AbortError") setCircularError(reason.message);
      }
    };
    void loadCirculars();
    return () => controller.abort();
  }, [instituteId, refreshCirculars]);

  async function publishNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const body = new FormData(event.currentTarget);
      body.set("instituteId", instituteId);
      body.set("format", format);
      const response = await fetch("/api/notices", { method: "POST", body });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to publish notice.");
      formRef.current?.reset();
      setFormat("document");
      setMessage("Notice published to the public notice board.");
      setRefresh((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to publish notice.");
    } finally {
      setSaving(false);
    }
  }

  async function publishCircular(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCircularSaving(true);
    setCircularError("");
    setCircularMessage("");
    const form = event.currentTarget;
    try {
      const values = new FormData(form);
      const response = await fetch("/api/public/admissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instituteId,
          title: values.get("circularTitle"),
          body: values.get("circularBody"),
          applicationDeadline: values.get("applicationDeadline") || null,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to publish admission circular.");
      form.reset();
      setCircularMessage("Admission circular published. Applicants can now submit an online application.");
      setRefreshCirculars((value) => value + 1);
    } catch (reason) {
      setCircularError(reason instanceof Error ? reason.message : "Unable to publish admission circular.");
    } finally {
      setCircularSaving(false);
    }
  }

  return (
    <div className="notice-admin-page">
      <section className="page-heading">
        <div><div className="eyebrow">PUBLIC COMMUNICATIONS</div><h1>Notice board</h1><p className="subtitle">Publish written announcements or scanned notice images for {instituteName || "this institute"}.</p></div>
        <a className="btn" href={`/notices?instituteId=${encodeURIComponent(instituteId)}`} target="_blank" rel="noreferrer">Open public board</a>
      </section>
      {error && <div className="callout attendance-notice" role="alert">{error}</div>}
      {message && <div className="callout attendance-success" role="status">{message}</div>}
      <section className="panel notice-create-panel">
        <div className="panel-head"><div><h2>Create a notice</h2><p>Choose document format for written notices, or image format for scans and PDFs.</p></div></div>
        <form ref={formRef} className="notice-create-form" onSubmit={(event) => void publishNotice(event)}>
          <fieldset className="notice-format-choice">
            <legend>Notice format</legend>
            <label className={format === "document" ? "selected" : ""}><input type="radio" name="noticeFormatChoice" checked={format === "document"} onChange={() => setFormat("document")} /><FileText size={17} />Written document</label>
            <label className={format === "image" ? "selected" : ""}><input type="radio" name="noticeFormatChoice" checked={format === "image"} onChange={() => setFormat("image")} /><ImagePlus size={17} />Image or PDF upload</label>
          </fieldset>
          <div className="notice-form-grid">
            <label className="field notice-title-field"><span>Notice title *</span><input name="title" maxLength={200} required placeholder="Enter an official notice title" /></label>
            <label className="field"><span>Category *</span><select name="category" defaultValue="Academic" required>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="field"><span>Notice date *</span><input name="noticeDate" type="date" defaultValue={todayDate()} required /></label>
            {format === "document" ? (
              <label className="field notice-description-field"><span>Notice description / document text *</span><textarea name="description" rows={10} maxLength={20000} required placeholder={"Write or paste the official notice text here.\nLine breaks and paragraphs will be preserved."} /><small>Plain text is safely rendered as an official document with its paragraph formatting.</small></label>
            ) : (
              <>
                <label className="field notice-upload-field"><span>Image or PDF file *</span><input name="file" type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.jpg,.jpeg,.png,.gif,.webp,.pdf" required /><small>JPEG, PNG, GIF, WebP, or PDF. Maximum file size: 10 MB.</small></label>
                <label className="field notice-description-field"><span>Caption or description</span><textarea name="description" rows={4} maxLength={20000} placeholder="Optional context or instructions for students" /></label>
              </>
            )}
          </div>
          <div className="notice-form-actions"><span><Upload size={15} /> Notices publish immediately and appear on the public board.</span><button className="btn primary" type="submit" disabled={saving}>{saving ? "Publishing…" : "Publish notice"}</button></div>
        </form>
      </section>
      <section className="panel notice-circular-panel">
        <div className="panel-head"><div><h2>Admission circulars</h2><p>Publish an open admission circular with an online application form for students.</p></div></div>
        {circularError && <div className="callout attendance-notice" role="alert">{circularError}</div>}
        {circularMessage && <div className="callout attendance-success" role="status">{circularMessage}</div>}
        <form ref={circularFormRef} className="notice-circular-form" onSubmit={(event) => void publishCircular(event)}>
          <label className="field"><span>Circular title *</span><input name="circularTitle" maxLength={180} required placeholder="e.g. Diploma in Engineering Admission 2026–27" /></label>
          <label className="field"><span>Application deadline</span><input name="applicationDeadline" type="date" min={todayDate()} /></label>
          <label className="field notice-circular-body"><span>Circular details *</span><textarea name="circularBody" rows={6} maxLength={10000} required placeholder="Admission requirements, instructions, and important dates" /></label>
          <div className="notice-form-actions"><span>Applicants create an email/password account while submitting.</span><button className="btn primary" type="submit" disabled={circularSaving}>{circularSaving ? "Publishing…" : "Publish circular"}</button></div>
        </form>
        <div className="notice-circular-list">
          {circulars.map((circular) => <article className="notice-circular-item" key={circular.id}><div><strong>{circular.title}</strong><p>{circular.body}</p></div><span>{circular.applicationDeadline ? `Deadline · ${circular.applicationDeadline}` : "Open"}</span></article>)}
          {!circulars.length && !circularError && <div className="notice-feed-empty">No open admission circulars are published.</div>}
        </div>
      </section>
      <NoticeFeed key={`${instituteId}-${refresh}`} instituteId={instituteId} title="Published notices" subtitle="These notices are visible on the public institute board and in the student portal." />
    </div>
  );
}
