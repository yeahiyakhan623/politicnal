import { Portal } from "@/components/portal";
import { canManageStudents } from "@/lib/auth/authorization";
import { getCurrentSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PendingRequestsPage() {
  if (!process.env.DATABASE_URL) redirect("/login");
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role === "STUDENT") redirect("/student");
  if (!canManageStudents(session)) redirect("/access-denied");

  return <Portal user={{
    id: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
    instituteId: session.instituteId,
  }} initialPage="Pending Requests" />;
}
