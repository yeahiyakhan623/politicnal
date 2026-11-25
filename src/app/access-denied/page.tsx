import Link from "next/link";

export default function AccessDeniedPage() {
  return <main className="login-page"><section className="login-card">
    <div className="login-heading"><span className="login-shield">!</span><span className="login-kicker">ACCESS RESTRICTED</span></div>
    <h1>Admin workspace only</h1>
    <p className="login-subtitle">This workspace is available to institute administrators and teachers. Use an account with the appropriate role or return to sign in.</p>
    <Link className="btn primary login-submit" href="/login">Return to sign in</Link>
  </section></main>;
}
