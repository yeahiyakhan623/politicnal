import { PasswordResetForm } from "@/components/password-reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const query = await searchParams;
  const token = Array.isArray(query.token) ? query.token[0] ?? "" : query.token ?? "";
  return <PasswordResetForm token={token} />;
}
