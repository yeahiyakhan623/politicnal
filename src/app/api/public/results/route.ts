import { NextResponse, type NextRequest } from "next/server";
import { ApiRequestError, apiError, readJsonBody } from "@/lib/api/http";
import { getPool } from "@/lib/db";
import { validatePublicResultSearch } from "@/lib/public-portal/validation";

export const runtime = "nodejs";

function departmentAliases(value: string) {
  const department = value.trim().toLowerCase();
  const aliases: Record<string, string[]> = {
    "computer technology": ["computer technology", "computer", "cst"],
    "electrical technology": ["electrical technology", "electrical"],
    "civil technology": ["civil technology", "civil"],
    "mechanical technology": ["mechanical technology", "mechanical"],
    "electronics technology": ["electronics technology", "electronics"],
    "power technology": ["power technology", "power"],
  };
  return aliases[department] ?? [department];
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request, 8_192);
    let input: ReturnType<typeof validatePublicResultSearch>;
    try {
      input = validatePublicResultSearch(body);
    } catch (error) {
      if (error instanceof Error) throw new ApiRequestError(error.message, 400);
      throw error;
    }
    const { instituteId, sessionYear, semester, department, examType, searchBy, searchValue } = input;
    const escapedSearchValue = searchValue.replace(/[\\%_]/g, "\\$&");
    const searchCondition = searchBy === "rollNumber"
      ? "lower(trim(s.roll_number)) = lower($6)"
      : searchBy === "studentName"
        ? "s.full_name ILIKE $7 ESCAPE '\\'"
        : "lower(trim(s.registration_number)) = lower($6)";
    const result = await getPool().query<{
      studentId: string;
      studentName: string | null;
      rollNumber: string | null;
      registrationNumber: string | null;
      semester: number;
      department: string | null;
      sessionYear: string | null;
      subjectId: string;
      subjectName: string;
      subjectCode: string | null;
      examName: string;
      examYear: number;
      examFullMarks: string;
      marks: string | null;
      gradePoint: string | null;
      letterGrade: string | null;
      publishedAt: Date | string | null;
    }>(
      `SELECT s.id AS "studentId", s.full_name AS "studentName",
              s.roll_number AS "rollNumber", s.registration_number AS "registrationNumber",
              s.semester, s.department, s.session_year AS "sessionYear",
              subject.id AS "subjectId", subject.name AS "subjectName", subject.code AS "subjectCode",
              result.exam_name AS "examName", result.exam_year AS "examYear",
              result.exam_full_marks AS "examFullMarks", result.marks,
              result.grade_point AS "gradePoint", result.letter_grade AS "letterGrade",
              result.published_at AS "publishedAt"
       FROM public.students s
       JOIN public.semester_exam_results result
         ON result.student_id = s.id AND result.institute_id = s.institute_id
       JOIN public.semester_subjects subject
         ON subject.id = result.subject_id AND subject.institute_id = result.institute_id
       JOIN public.institutes institute
         ON institute.id = s.institute_id AND institute.review_status = 'approved'
       WHERE s.institute_id = $1 AND s.session_year = $2 AND s.semester = $3
         AND lower(trim(s.department)) = ANY($4::text[])
         AND s.is_active = true AND s.approval_status = 'approved'
         AND result.status = 'published' AND result.exam_name = $5
         AND ${searchCondition}
       ORDER BY s.full_name, subject.name, result.exam_year DESC
       LIMIT 500`,
      [
        instituteId, sessionYear, semester, departmentAliases(department), examType,
        searchValue, `%${escapedSearchValue}%`,
      ],
    );
    const rows = result.rows.map((row) => ({
      ...row,
      semester: Number(row.semester),
      examYear: Number(row.examYear),
      examFullMarks: Number(row.examFullMarks),
      marks: row.marks === null ? null : Number(row.marks),
      gradePoint: row.gradePoint === null ? null : Number(row.gradePoint),
      publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    }));
    return NextResponse.json({ data: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiError(error);
    if (response) return response;
    if (error instanceof ApiRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Public result search failed.", error);
    return NextResponse.json({ error: "Unable to search published results." }, { status: 500 });
  }
}
