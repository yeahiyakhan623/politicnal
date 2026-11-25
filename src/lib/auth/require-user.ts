import "server-only";

import { getCurrentSession, type SessionUser } from "@/lib/auth/session";
import {
  AuthenticationError,
  AuthorizationError,
  type AppRole,
} from "@/lib/auth/authorization";

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentSession();
  if (!user) throw new AuthenticationError();
  return user;
}

export async function requireRoles(...roles: AppRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthorizationError();
  }
  return user;
}
