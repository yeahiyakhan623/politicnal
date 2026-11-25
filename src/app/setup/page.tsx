import { SuperAdminSetupForm } from "@/components/super-admin-setup-form";
import { hasSuperAdmin } from "@/lib/auth/setup";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!process.env.DATABASE_URL) {
    return <SuperAdminSetupForm databaseConfigured={false} />;
  }
  if (await hasSuperAdmin()) redirect("/login");
  return <SuperAdminSetupForm databaseConfigured />;
}
