"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import {
  ArrowUpRight,
  ImagePlus,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import type {
  InstitutePublicProfile,
  PublicProfileDepartment,
  PublicProfileLeader,
  PublicProfileLink,
  PublicProfileService,
} from "@/lib/public-profile/types";
import { DEFAULT_PUBLIC_PROFILE } from "@/lib/public-profile/defaults";

type Props = { instituteId: string; instituteName: string };
type ApiResponse = { data?: InstitutePublicProfile; error?: string };

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      reject(new Error("Choose a JPEG, PNG, or WebP image."));
      return;
    }
    if (file.size < 1 || file.size > 1_500_000) {
      reject(new Error("Profile images must be smaller than 1.5 MB."));
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Unable to read the selected image."));
    });
    reader.addEventListener("error", () => reject(new Error("Unable to read the selected image.")));
    reader.readAsDataURL(file);
  });
}

export function PublicProfileAdmin({ instituteId, instituteName }: Props) {
  const [profile, setProfile] = useState<InstitutePublicProfile>(() => ({
    instituteId,
    ...structuredClone(DEFAULT_PUBLIC_PROFILE),
    updatedAt: null,
  }));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!instituteId) return;
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(new Error("Profile load timed out.")), 8_000);
    const load = async () => {
      try {
        const response = await fetch(`/api/public/profile?instituteId=${encodeURIComponent(instituteId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json() as ApiResponse;
        if (!response.ok || !body.data) throw new Error(body.error ?? "Unable to load public profile.");
        setProfile(body.data);
        setError("");
      } catch (reason) {
        if (disposed) return;
        if (controller.signal.aborted) {
          setError(controller.signal.reason instanceof Error
            ? controller.signal.reason.message
            : "Public profile request was cancelled.");
        } else {
          setError(reason instanceof Error ? reason.message : "Unable to load public profile.");
        }
      }
    };
    void load();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [instituteId, loadAttempt]);

  function patch<K extends keyof InstitutePublicProfile>(key: K, value: InstitutePublicProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
    setMessage("");
    setError("");
  }

  function updateLeader(id: string, key: keyof PublicProfileLeader, value: string) {
    patch("leadership", profile.leadership.map((item) => item.id === id ? { ...item, [key]: value } : item));
  }

  function updateDepartment(id: string, key: keyof PublicProfileDepartment, value: string) {
    patch("departments", profile.departments.map((item) => item.id === id ? { ...item, [key]: value } : item));
  }

  function updateService(id: string, key: keyof PublicProfileService, value: string) {
    patch("services", profile.services.map((item) => item.id === id ? { ...item, [key]: value } : item));
  }

  function updateLink(id: string, key: keyof PublicProfileLink, value: string) {
    patch("links", profile.links.map((item) => item.id === id ? { ...item, [key]: value } : item));
  }

  async function uploadLeaderImage(id: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      updateLeader(id, "imageUrl", await readImage(file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to upload profile image.");
    }
  }

  function addLeader() {
    patch("leadership", [...profile.leadership, {
      id: newId("leader"),
      name: "",
      designation: "",
      bio: "",
      imageUrl: "",
    }]);
  }

  function addDepartment() {
    patch("departments", [...profile.departments, {
      id: newId("department"),
      name: "",
      description: "",
    }]);
  }

  function addService() {
    patch("services", [...profile.services, {
      id: newId("service"),
      name: "",
      description: "",
      url: "",
    }]);
  }

  function addLink() {
    patch("links", [...profile.links, {
      id: newId("link"),
      label: "",
      description: "",
      url: "https://",
    }]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!instituteId) {
      setError("Select an institute workspace before saving.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/public/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instituteId, profile }),
      });
      const body = await response.json() as ApiResponse;
      if (!response.ok || !body.data) throw new Error(body.error ?? "Unable to save public profile.");
      setProfile(body.data);
      setMessage("Public profile saved. The public portal now displays these updates.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save public profile.");
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaults() {
    const confirmed = window.confirm("Replace all current profile content with the starter AMRPI profile?");
    if (!confirmed) return;
    setProfile({ instituteId, ...structuredClone(DEFAULT_PUBLIC_PROFILE), updatedAt: profile.updatedAt });
    setMessage("");
    setError("");
  }

  return (
    <form className="public-profile-admin" onSubmit={(event) => void save(event)}>
      <header className="public-profile-admin-heading">
        <div><span className="eyebrow">PUBLIC WEBSITE CONTENT</span><h2>{instituteName} profile</h2><p>Edit sections shown on the public homepage. Changes appear after saving.</p></div>
        <a className="btn" href="/" target="_blank" rel="noopener noreferrer">Preview public portal <ArrowUpRight size={14} /></a>
      </header>
      {!instituteId && <div className="login-alert" role="status">Select an institute workspace before saving. The starter profile is ready to edit.</div>}
      {error && <div className="login-alert" role="alert">{error} The editable starter profile is shown below. <button className="btn small" type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry loading</button></div>}
      {message && <div className="callout attendance-notice" role="status">{message}</div>}

      <section className="public-profile-editor-section">
        <div className="public-profile-editor-title"><span>00</span><div><h3>Institute identity &amp; hero</h3><p>Set the public name and main homepage headline.</p></div></div>
        <label className="field"><span>Official institute name</span><input required maxLength={180} value={profile.instituteName} onChange={(event) => patch("instituteName", event.target.value)} /></label>
        <label className="field"><span>Hero title</span><input required maxLength={240} value={profile.heroTitle} onChange={(event) => patch("heroTitle", event.target.value)} /></label>
        <label className="field"><span>Hero title (Bengali)</span><input maxLength={240} value={profile.heroTitleBn} onChange={(event) => patch("heroTitleBn", event.target.value)} /></label>
        <label className="field"><span>Hero description</span><textarea rows={2} maxLength={1000} required value={profile.heroDescription} onChange={(event) => patch("heroDescription", event.target.value)} /></label>
      </section>

      <section className="public-profile-editor-section">
        <div className="public-profile-editor-title"><span>01</span><div><h3>Institute overview &amp; history</h3><p>Describe the institute and its background.</p></div></div>
        <label className="field"><span>Overview</span><textarea rows={4} maxLength={10000} required value={profile.overview} onChange={(event) => patch("overview", event.target.value)} /></label>
        <label className="field"><span>History</span><textarea rows={4} maxLength={10000} required value={profile.history} onChange={(event) => patch("history", event.target.value)} /></label>
      </section>

      <section className="public-profile-editor-section">
        <div className="public-profile-editor-title"><span>02</span><div><h3>Leadership &amp; guidance</h3><p>Add, edit, or remove people displayed on the public site.</p></div><button className="btn small" type="button" onClick={addLeader}><Plus size={14} />Add profile</button></div>
        <div className="public-profile-edit-grid">
          {profile.leadership.map((leader) => <article className="public-profile-edit-card" key={leader.id}>
            <button className="row-action public-profile-delete" type="button" aria-label={`Delete ${leader.name || "leadership profile"}`} onClick={() => patch("leadership", profile.leadership.filter((item) => item.id !== leader.id))}><Trash2 /></button>
            <label className="field"><span>Name</span><input required maxLength={180} value={leader.name} onChange={(event) => updateLeader(leader.id, "name", event.target.value)} /></label>
            <label className="field"><span>Designation</span><input required maxLength={180} value={leader.designation} onChange={(event) => updateLeader(leader.id, "designation", event.target.value)} /></label>
            <label className="field"><span>Biography</span><textarea rows={3} maxLength={2000} value={leader.bio} onChange={(event) => updateLeader(leader.id, "bio", event.target.value)} /></label>
            <label className="field"><span>Image URL (HTTPS)</span><input type="url" maxLength={2048} value={leader.imageUrl.startsWith("data:image/") ? "" : leader.imageUrl} onChange={(event) => updateLeader(leader.id, "imageUrl", event.target.value)} placeholder="https://…" /></label>
            <label className="public-profile-upload"><ImagePlus size={15} />Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadLeaderImage(leader.id, event)} /></label>
            {leader.imageUrl && <button className="btn small" type="button" onClick={() => updateLeader(leader.id, "imageUrl", "")}>Remove image</button>}
          </article>)}
        </div>
      </section>

      <section className="public-profile-editor-section">
        <div className="public-profile-editor-title"><span>03</span><div><h3>Technologies &amp; departments</h3><p>Manage the academic areas shown to visitors.</p></div><button className="btn small" type="button" onClick={addDepartment}><Plus size={14} />Add department</button></div>
        <div className="public-profile-edit-grid">
          {profile.departments.map((department) => <article className="public-profile-edit-card" key={department.id}>
            <button className="row-action public-profile-delete" type="button" aria-label={`Delete ${department.name || "department"}`} onClick={() => patch("departments", profile.departments.filter((item) => item.id !== department.id))}><Trash2 /></button>
            <label className="field"><span>Department name</span><input required maxLength={180} value={department.name} onChange={(event) => updateDepartment(department.id, "name", event.target.value)} /></label>
            <label className="field"><span>Description</span><textarea rows={3} maxLength={2000} value={department.description} onChange={(event) => updateDepartment(department.id, "description", event.target.value)} /></label>
          </article>)}
        </div>
      </section>

      <section className="public-profile-editor-section">
        <div className="public-profile-editor-title"><span>04</span><div><h3>Student services &amp; facilities</h3><p>Update career support, attachments, stipends, and course information.</p></div><button className="btn small" type="button" onClick={addService}><Plus size={14} />Add service</button></div>
        <div className="public-profile-edit-grid">
          {profile.services.map((service) => <article className="public-profile-edit-card" key={service.id}>
            <button className="row-action public-profile-delete" type="button" aria-label={`Delete ${service.name || "service"}`} onClick={() => patch("services", profile.services.filter((item) => item.id !== service.id))}><Trash2 /></button>
            <label className="field"><span>Service name</span><input required maxLength={180} value={service.name} onChange={(event) => updateService(service.id, "name", event.target.value)} /></label>
            <label className="field"><span>Description</span><textarea rows={3} maxLength={2000} value={service.description} onChange={(event) => updateService(service.id, "description", event.target.value)} /></label>
            <label className="field"><span>Optional HTTPS notice or download URL</span><input type="url" maxLength={2048} value={service.url ?? ""} onChange={(event) => updateService(service.id, "url", event.target.value)} placeholder="https://…" /></label>
          </article>)}
        </div>
      </section>

      <section className="public-profile-editor-section">
        <div className="public-profile-editor-title"><span>05</span><div><h3>Contact information</h3><p>Update public address, phone numbers, and email.</p></div></div>
        <label className="field"><span>Address</span><input required maxLength={500} value={profile.contact.address} onChange={(event) => patch("contact", { ...profile.contact, address: event.target.value })} /></label>
        <div className="public-profile-phone-list">
          {profile.contact.phones.map((phone, index) => <label className="field" key={`phone-${index}`}><span>Phone {index + 1}</span><div className="public-profile-phone-input"><input maxLength={40} value={phone} onChange={(event) => patch("contact", { ...profile.contact, phones: profile.contact.phones.map((value, phoneIndex) => phoneIndex === index ? event.target.value : value) })} /><button className="row-action" type="button" aria-label={`Remove phone ${index + 1}`} onClick={() => patch("contact", { ...profile.contact, phones: profile.contact.phones.filter((_, phoneIndex) => phoneIndex !== index) })}><Trash2 /></button></div></label>)}
          <button className="btn small" type="button" onClick={() => patch("contact", { ...profile.contact, phones: [...profile.contact.phones, ""] })}><Plus size={14} />Add phone</button>
        </div>
        <label className="field"><span>Email</span><input type="email" maxLength={254} value={profile.contact.email} onChange={(event) => patch("contact", { ...profile.contact, email: event.target.value })} /></label>
      </section>

      <section className="public-profile-editor-section">
        <div className="public-profile-editor-title"><span>06</span><div><h3>Official &amp; social links</h3><p>Manage board, government, and social links shown on the public site.</p></div><button className="btn small" type="button" onClick={addLink}><Plus size={14} />Add link</button></div>
        <div className="public-profile-edit-grid">
          {profile.links.map((link) => <article className="public-profile-edit-card" key={link.id}>
            <button className="row-action public-profile-delete" type="button" aria-label={`Delete ${link.label || "link"}`} onClick={() => patch("links", profile.links.filter((item) => item.id !== link.id))}><Trash2 /></button>
            <label className="field"><span>Link label</span><input required maxLength={120} value={link.label} onChange={(event) => updateLink(link.id, "label", event.target.value)} /></label>
            <label className="field"><span>Description</span><input maxLength={240} value={link.description} onChange={(event) => updateLink(link.id, "description", event.target.value)} /></label>
            <label className="field"><span>HTTPS URL</span><input type="url" required maxLength={2048} value={link.url} onChange={(event) => updateLink(link.id, "url", event.target.value)} /></label>
          </article>)}
        </div>
      </section>

      <div className="public-profile-savebar">
        <button className="btn" type="button" onClick={restoreDefaults}>Restore starter profile</button>
        <button className="btn primary" type="submit" disabled={saving || !instituteId}>{saving ? <LoaderCircle className="spinner" size={15} /> : <Save size={15} />}Save Changes</button>
      </div>
    </form>
  );
}
