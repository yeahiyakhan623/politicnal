"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function PasswordResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") ?? "");
    if (token && password !== String(formData.get("confirmation") ?? "")) {
      setError("The passwords do not match.");
      setSaving(false);
      return;
    }
    try {
      const response = await fetch(token ? "/api/auth/reset-password" : "/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(token
          ? {
              token,
              password,
            }
          : { email: formData.get("email") }),
      });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to process the password reset.");
      if (token) router.replace("/login");
      else {
        form.reset();
        setMessage(body.message ?? "If an active account uses that email, password reset instructions will be sent.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to process the password reset.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="login-page">
    <section className="login-card">
      <div className="eyebrow">STUDENT & INSTITUTE ACCESS</div>
      <h1>{token ? "Choose a new password" : "Reset your password"}</h1>
      <p className="subtitle">
        {token
          ? "Choose a new password for your account. This reset link can only be used once."
          : "Enter your account email. If it matches an active account, we will send a secure reset link."}
      </p>
      {error && <div className="login-alert" role="alert">{error}</div>}
      {message && <div className="login-alert" role="status">{message}</div>}
      <form className="login-form" onSubmit={(event) => void submit(event)}>
        {token ? <>
          <label className="field"><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
          <label className="field"><span>Confirm new password</span><input name="confirmation" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
        </> : <label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Please wait…" : token ? "Reset password" : "Send reset link"}
        </button>
      </form>
      <p className="login-footnote"><Link href="/login">Return to sign in</Link></p>
    </section>
  </main>;
}
