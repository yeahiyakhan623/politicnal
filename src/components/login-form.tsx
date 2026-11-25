"use client";

import { FormEvent, useState } from "react";
import { GraduationCap, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function LoginForm({ databaseConfigured }: { databaseConfigured: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: formData.get("identifier"),
          password: formData.get("password"),
        }),
      });
      const data: { error?: string; user?: { role?: string } } = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to sign in.");
        return;
      }
      router.replace(data.user?.role === "STUDENT" ? "/student" : "/admin");
      router.refresh();
    } catch {
      setError("Unable to reach the sign-in service. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="login-page">
    <section className="login-card">
      <Link className="brand login-brand" href="/" aria-label="AMRPI home">
        <span className="brand-mark"><GraduationCap aria-hidden="true" /></span>
        <span><span className="brand-name">AMRPI</span><span className="brand-caption">STUDENT & INSTITUTE ACCESS</span></span>
      </Link>
      <div className="login-heading"><span className="login-shield"><ShieldCheck size={18} /></span><span className="login-kicker">SECURE INSTITUTE ACCESS</span></div>
      <h1>Portal sign in</h1>
      <p className="login-subtitle">Sign in with your institute or student account.</p>
      {!databaseConfigured && <div className="login-alert" role="status">Database is not configured. Set <code>DATABASE_URL</code> and apply migrations before signing in.</div>}
      {error && <div className="login-alert" role="alert">{error}</div>}
      <form className="login-form" onSubmit={submit}>
        <div className="field"><label htmlFor="login-identifier">Email address or Student Login ID</label><input id="login-identifier" name="identifier" type="text" autoComplete="username" required maxLength={254} /></div>
        <div className="field"><label htmlFor="login-password">Password</label><input id="login-password" name="password" type="password" autoComplete="current-password" required maxLength={128} /></div>
        <button className="btn primary login-submit" type="submit" disabled={submitting || !databaseConfigured}>{submitting && <LoaderCircle className="spinner" size={16} />}Sign in</button>
      </form>
      {databaseConfigured && <p className="login-footnote"><Link href="/reset-password">Forgot your password?</Link></p>}
      <p className="login-footnote">Student account requests are reviewed by the institute. New administrator accounts can only be provisioned by an authorized system operator.</p>
    </section>
  </main>;
}
