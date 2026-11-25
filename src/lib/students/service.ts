import "server-only";

import { getPool } from "@/lib/db";
import {
  assertInstituteAccess,
  assertStudentManagementAccess,
  type AuthenticatedUser,
} from "@/lib/auth/authorization";
import type { StudentRecord, StudentStatus } from "@/lib/students/types";

type RawStudent = {
  id: string;
  full_name: string | null;
  roll_number: string | null;
  registration_number: string | null;
  email: string | null;
  student_phone: string | null;
  guardian_name: string | null;
  guardian_contact: string | null;
  father_name: string | null;
  mother_name: string | null;
  father_phone: string | null;
  mother_phone: string | null;
  address: string | null;
  date_of_birth: Date | string | null;
  is_active: boolean;
  approval_status: "pending" | "approved" | "rejected";
  semester: number;
  department: string | null;
  session_year: string | null;
  created_at: Date | string;
};

const SELECT_STUDENT = `
  SELECT s.id, s.full_name, s.roll_number, s.registration_number, s.email, s.student_phone,
         s.guardian_name, s.guardian_contact, s.father_name, s.mother_name, s.father_phone,
         s.mother_phone, s.address, s.date_of_birth, s.is_active, s.approval_status,
         s.semester, s.department, s.session_year, s.created_at
  FROM public.students s
`;

function toStudent(row: RawStudent): StudentRecord {
  const status: StudentStatus = row.approval_status === "pending"
    ? "pending"
    : row.approval_status === "rejected"
      ? "rejected"
      : row.is_active ? "active" : "inactive";
  return {
    id: row.id,
    fullName: row.full_name ?? "",
    rollNumber: row.roll_number ?? "",
    registrationNumber: row.registration_number ?? "",
    email: row.email,
    studentPhone: row.student_phone,
    guardianName: row.guardian_name,
    guardianContact: row.guardian_contact,
    fatherName: row.father_name,
    motherName: row.mother_name,
    fatherPhone: row.father_phone,
    motherPhone: row.mother_phone,
    address: row.address,
    dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().slice(0, 10) : null,
    isActive: row.is_active,
    approvalStatus: row.approval_status,
    status,
    semester: Number(row.semester),
    department: row.department,
    sessionYear: row.session_year,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function resolveInstituteId(user: AuthenticatedUser, requestedId?: string | null) {
  if (user.role === "SUPER_ADMIN") {
    if (!requestedId) throw new Error("Select an institute to continue.");
    const result = await getPool().query("SELECT 1 FROM public.institutes WHERE id = $1", [requestedId]);
    if (!result.rowCount) throw new Error("Institute was not found.");
    return requestedId;
  }
  if (!user.instituteId) throw new Error("This account is not linked to an institute.");
  assertInstituteAccess(user, user.instituteId);
  return user.instituteId;
}

export async function getStudentRecord(studentId: string, instituteId: string) {
  const result = await getPool().query<RawStudent>(
    `${SELECT_STUDENT} WHERE s.id = $1 AND s.institute_id = $2`,
    [studentId, instituteId],
  );
  return result.rows[0] ? toStudent(result.rows[0]) : null;
}

export async function getStudentForUser(userId: string, studentId: string | null) {
  if (!studentId) return null;
  const result = await getPool().query<RawStudent>(
    `${SELECT_STUDENT}
     JOIN public.users u ON u.student_id = s.id
     WHERE s.id = $1 AND u.id = $2 AND u.role = 'student' AND u.is_active = true`,
    [studentId, userId],
  );
  return result.rows[0] ? toStudent(result.rows[0]) : null;
}

export async function listStudents(input: {
  instituteId: string;
  page: number;
  pageSize: number;
  search: string;
  department: string;
  semester: number;
  sessionYear: string;
}) {
  const params: unknown[] = [input.instituteId];
  const conditions = ["s.institute_id = $1"];
  const addCondition = (sql: (index: number) => string, value: unknown) => {
    params.push(value);
    conditions.push(sql(params.length));
  };

  if (input.search) {
    const escaped = input.search.replace(/[\\%_]/g, "\\$&");
    addCondition((index) => `(COALESCE(s.full_name, '') ILIKE $${index} ESCAPE '\\' OR COALESCE(s.roll_number, '') ILIKE $${index} ESCAPE '\\' OR COALESCE(s.registration_number, '') ILIKE $${index} ESCAPE '\\' OR COALESCE(s.student_code, '') ILIKE $${index} ESCAPE '\\')`, `%${escaped}%`);
  }
  if (input.department) addCondition((index) => `COALESCE(s.department, '') = $${index}`, input.department);
  if (input.semester) addCondition((index) => `s.semester = $${index}`, input.semester);
  if (input.sessionYear) addCondition((index) => `s.session_year = $${index}`, input.sessionYear);

  const where = conditions.join(" AND ");
  const offset = (input.page - 1) * input.pageSize;
  const [count, rows] = await Promise.all([
    getPool().query<{ total: string }>(
      `SELECT count(*)::text AS total FROM public.students s WHERE ${where}`,
      params,
    ),
    getPool().query<RawStudent>(
      `${SELECT_STUDENT}
       WHERE ${where}
       ORDER BY s.created_at DESC, s.id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, input.pageSize, offset],
    ),
  ]);
  const total = Number(count.rows[0]?.total ?? 0);
  return {
    data: rows.rows.map(toStudent),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

export async function getInstituteOptions(user: AuthenticatedUser) {
  assertStudentManagementAccess(user);
  if (user.role !== "SUPER_ADMIN") {
    if (!user.instituteId) throw new Error("This account is not linked to an institute.");
    const result = await getPool().query<{ id: string; name: string }>(
      "SELECT id, name FROM public.institutes WHERE id = $1",
      [user.instituteId],
    );
    return result.rows;
  }
  const result = await getPool().query<{ id: string; name: string }>(
    "SELECT id, name FROM public.institutes ORDER BY name",
  );
  return result.rows;
}
