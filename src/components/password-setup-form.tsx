"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function PasswordSetupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setError("This password setup link is invalid or missing.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/auth/setup-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to set your password.");
      router.replace("/student");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to set your password.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="login-page">
    <section className="login-card">
      <div className="eyebrow">STUDENT PORTAL</div>
      <h1>Set your password</h1>
      <p className="subtitle">Choose a secure password to activate your student sign-in.</p>
      <form className="login-form" onSubmit={(event) => void submit(event)}>
        {error && <div className="login-alert" role="alert">{error}</div>}
        <label className="field"><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
        <label className="field"><span>Confirm new password</span><input name="confirmation" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
        <button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving password…" : "Set password and continue"}</button>
      </form>
    </section>
  </main>;
}
