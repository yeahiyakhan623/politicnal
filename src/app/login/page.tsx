import { LoginForm } from "@/components/login-form";
import { canManageStudents } from "@/lib/auth/authorization";
import { getCurrentSession } from "@/lib/auth/session";
import { hasSuperAdmin } from "@/lib/auth/setup";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!process.env.DATABASE_URL) {
    return <LoginForm databaseConfigured={false} />;
  }
  if (!await hasSuperAdmin()) redirect("/setup");
  const session = await getCurrentSession();
  if (session?.role === "STUDENT") redirect("/student");
  if (session && canManageStudents(session)) redirect("/admin");
  if (session) redirect("/access-denied");
  return <LoginForm databaseConfigured={Boolean(process.env.DATABASE_URL)} />;
}
