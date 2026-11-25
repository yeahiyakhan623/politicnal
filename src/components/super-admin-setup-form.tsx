"use client";

import { FormEvent, useState } from "react";
import { GraduationCap, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function SuperAdminSetupForm({ databaseConfigured }: { databaseConfigured: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to set up the Super Admin account.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Unable to reach the setup service. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="login-page">
    <section className="login-card">
      <Link className="brand login-brand" href="/" aria-label="AMRPI home">
        <span className="brand-mark"><GraduationCap aria-hidden="true" /></span>
        <span><span className="brand-name">AMRPI</span><span className="brand-caption">INITIAL SYSTEM SETUP</span></span>
      </Link>
      <div className="login-heading"><span className="login-shield"><ShieldCheck size={18} /></span><span className="login-kicker">ONE-TIME SUPER ADMIN SETUP</span></div>
      <h1>Create the primary admin</h1>
      <p className="login-subtitle">Set the name, email and password for the sole system Super Admin.</p>
      {!databaseConfigured && <div className="login-alert" role="status">Database is not configured. Set <code>DATABASE_URL</code> before system setup.</div>}
      {error && <div className="login-alert" role="alert">{error}</div>}
      <form className="login-form" onSubmit={submit}>
        <div className="field"><label htmlFor="setup-name">Full name</label><input id="setup-name" name="name" autoComplete="name" required minLength={2} maxLength={160} /></div>
        <div className="field"><label htmlFor="setup-email">Email address</label><input id="setup-email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
        <div className="field"><label htmlFor="setup-password">Password</label><input id="setup-password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></div>
        <button className="btn primary login-submit" type="submit" disabled={submitting || !databaseConfigured}>{submitting && <LoaderCircle className="spinner" size={16} />}Create Super Admin</button>
      </form>
      <p className="login-footnote">Setup is available only for a new system with no existing accounts, institutes, students, or student requests. Once records exist, contact the system operator.</p>
    </section>
  </main>;
}
