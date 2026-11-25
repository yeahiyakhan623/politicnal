import { NextResponse, type NextRequest } from "next/server";
import { ApiRequestError } from "@/lib/api/http";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonicalDepartment(value: string) {
  const department = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    cst: "Computer Technology",
    computer: "Computer Technology",
    "computer technology": "Computer Technology",
    civil: "Civil Technology",
    "civil technology": "Civil Technology",
    electrical: "Electrical Technology",
    "electrical technology": "Electrical Technology",
    mechanical: "Mechanical Technology",
    "mechanical technology": "Mechanical Technology",
    electronics: "Electronics Technology",
    "electronics technology": "Electronics Technology",
    power: "Power Technology",
    "power technology": "Power Technology",
  };
  return aliases[department] ?? value.trim();
}

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams;
    const instituteId = query.get("instituteId") ?? "";
    const semesterValue = query.get("semester") ?? "";
    if (!UUID.test(instituteId)) throw new ApiRequestError("Select a valid institute.", 400);
    if (!/^[1-8]$/.test(semesterValue)) throw new ApiRequestError("Semester must be between 1 and 8.", 400);
    const semester = Number(semesterValue);
    const [institute, sessions, departments] = await Promise.all([
      getPool().query(
        "SELECT 1 FROM public.institutes WHERE id = $1 AND review_status = 'approved'",
        [instituteId],
      ),
      getPool().query<{ sessionYear: string }>(
        `SELECT DISTINCT session_year AS "sessionYear"
         FROM public.students
         WHERE institute_id = $1 AND semester = $2 AND is_active = true
           AND approval_status = 'approved' AND session_year IS NOT NULL AND trim(session_year) <> ''
         ORDER BY "sessionYear" DESC`,
        [instituteId, semester],
      ),
      getPool().query<{ department: string }>(
        `SELECT department FROM (
           SELECT DISTINCT CASE lower(trim(department))
             WHEN 'cst' THEN 'Computer Technology'
             WHEN 'computer' THEN 'Computer Technology'
             WHEN 'computer technology' THEN 'Computer Technology'
             WHEN 'civil' THEN 'Civil Technology'
             WHEN 'civil technology' THEN 'Civil Technology'
             WHEN 'electrical' THEN 'Electrical Technology'
             WHEN 'electrical technology' THEN 'Electrical Technology'
             WHEN 'mechanical' THEN 'Mechanical Technology'
             WHEN 'mechanical technology' THEN 'Mechanical Technology'
             WHEN 'electronics' THEN 'Electronics Technology'
             WHEN 'electronics technology' THEN 'Electronics Technology'
             WHEN 'power' THEN 'Power Technology'
             WHEN 'power technology' THEN 'Power Technology'
             ELSE trim(department)
           END AS department
           FROM public.students
           WHERE institute_id = $1 AND semester = $2 AND is_active = true
             AND approval_status = 'approved' AND department IS NOT NULL AND trim(department) <> ''
           UNION
           SELECT DISTINCT trim(department) AS department
           FROM public.semester_subjects
           WHERE institute_id = $1 AND semester = $2 AND is_active = true
         ) values_by_department
         ORDER BY department`,
        [instituteId, semester],
      ),
    ]);
    if (!institute.rowCount) throw new ApiRequestError("Institute is not available.", 404);
    return NextResponse.json({
      sessions: sessions.rows.map((row) => row.sessionYear),
      departments: departments.rows.map((row) => canonicalDepartment(row.department)),
    }, { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" } });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Public academic catalog query failed.", error);
    return NextResponse.json({ error: "Unable to load academic sessions and departments." }, { status: 500 });
  }
}
