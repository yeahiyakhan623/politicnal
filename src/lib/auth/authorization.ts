export type AppRole =
  | "SUPER_ADMIN"
  | "INSTITUTE_ADMIN"
  | "TEACHER"
  | "STUDENT"
  | "ADMISSION_OFFICER";

export type AuthenticatedUser = {
  id: string;
  instituteId: string | null;
  role: AppRole;
};

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly status = 403;

  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function canManageStudents(user: AuthenticatedUser) {
  return user.role === "SUPER_ADMIN";
}

export function normalizeRole(role: string): AppRole | null {
  const normalized = role.trim().toUpperCase();
  if (
    normalized === "SUPER_ADMIN" ||
    normalized === "INSTITUTE_ADMIN" ||
    normalized === "TEACHER" ||
    normalized === "STUDENT" ||
    normalized === "ADMISSION_OFFICER"
  ) return normalized;
  return null;
}

export function assertStudentManagementAccess(user: AuthenticatedUser) {
  if (!canManageStudents(user)) {
    throw new AuthorizationError("Only the primary Super Admin can manage student records.");
  }
}

export function assertInstituteAccess(user: AuthenticatedUser, instituteId: string) {
  if (user.role === "SUPER_ADMIN") return;
  if (!user.instituteId || user.instituteId !== instituteId) {
    throw new AuthorizationError("The requested resource is not available to this account.");
  }
}

export function assertStudentReadAccess(
  user: AuthenticatedUser,
  student: { id: string; instituteId: string; profile: { userId: string | null } | null },
) {
  if (user.role === "STUDENT") {
    if (student.profile?.userId !== user.id) {
      throw new AuthorizationError("Students may only view their own record.");
    }
    return;
  }

  assertStudentManagementAccess(user);
  assertInstituteAccess(user, student.instituteId);
}
