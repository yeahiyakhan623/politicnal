import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiRequestError, apiError, readJsonBody } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { AuthorizationError } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/require-user";
import { getPool } from "@/lib/db";
import { resolveInstituteId } from "@/lib/students/service";
import { canonicalDepartmentLabel, departmentFilterValues, fallbackSubjects } from "@/lib/exam-results/departments";
import {
  isUuid,
  isExamType,
  validateExamResultInput,
  validateExamSubjectInput,
} from "@/lib/exam-results/validation";
import { POLYTECHNIC_DEPARTMENTS } from "@/lib/students/options";

export const runtime = "nodejs";

function assertExamManagementAccess(role: string) {
  if (!["SUPER_ADMIN", "INSTITUTE_ADMIN", "TEACHER"].includes(role)) {
    throw new AuthorizationError("Only administrators and teachers can manage exam results.");
  }
}

function semesterFromQuery(value: string | null) {
  if (!value || !/^[1-8]$/.test(value)) throw new ApiRequestError("Semester must be between 1 and 8.", 400);
  return Number(value);
}

async function getDepartments(instituteId: string, semester: number) {
  const result = await getPool().query<{ department: string }>(
    `SELECT department FROM (
       SELECT department
       FROM public.students
       WHERE institute_id=$1 AND semester=$2 AND department IS NOT NULL AND trim(department) <> ''
       UNION
       SELECT department
       FROM public.class_batches
       WHERE institute_id=$1
         AND department IS NOT NULL AND trim(department) <> ''
         AND lower(trim(name)) ~ ('^' || $2::text || '(st|nd|rd|th)?[[:space:]]*semester$')
       UNION
       SELECT department
       FROM public.semester_subjects
       WHERE institute_id=$1 AND semester=$2
         AND department IS NOT NULL AND trim(department) <> ''
     ) departments
     ORDER BY department`,
    [instituteId, semester],
  );
  const departments = new Set([
    ...POLYTECHNIC_DEPARTMENTS,
    ...result.rows.map((row) => canonicalDepartmentLabel(row.department)),
  ]);
  return NextResponse.json({ data: [...departments].sort() }, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=15" },
  });
}

async function ensureSubjects(instituteId: string, semester: number, department: string) {
  const departmentValues = departmentFilterValues(department);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.semester_subjects
         (institute_id, semester, department, code, name, credits, maximum_marks, is_preset)
       SELECT DISTINCT ON (lower(trim(template.name)))
              $1, template.semester, $2, template.code, template.name, template.credits,
              template.maximum_marks, true
       FROM public.semester_subjects template
       WHERE template.semester=$3 AND template.is_preset=true
         AND template.code LIKE 'DEF-%'
         AND lower(regexp_replace(trim(template.department), '[[:space:]_-]+', ' ', 'g')) = ANY($4::text[])
       ORDER BY lower(trim(template.name)), template.name
       ON CONFLICT DO NOTHING`,
      [instituteId, canonicalDepartmentLabel(department), semester, departmentValues],
    );
    const seededPreset = await client.query(
      `SELECT 1 FROM public.semester_subjects
       WHERE institute_id=$1 AND semester=$2 AND is_active=true AND is_preset=true
         AND lower(regexp_replace(trim(department), '[[:space:]_-]+', ' ', 'g')) = ANY($3::text[])
       LIMIT 1`,
      [instituteId, semester, departmentValues],
    );
    if (!seededPreset.rowCount) {
      const defaults = fallbackSubjects(semester, department);
      await client.query(
        `INSERT INTO public.semester_subjects
           (institute_id, semester, department, code, name, credits, maximum_marks, is_preset)
         SELECT $1, $2, $3, entry.code, entry.name, entry.credits, 100, true
         FROM unnest($4::text[], $5::text[], $6::numeric[])
           AS entry(code, name, credits)
         ON CONFLICT DO NOTHING`,
        [
          instituteId,
          semester,
          canonicalDepartmentLabel(department),
          defaults.map((subject) => subject.code),
          defaults.map((subject) => subject.name),
          defaults.map((subject) => subject.credits),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function getSubjects(instituteId: string, semester: number, department: string) {
  if (!department || department.length > 100) {
    throw new ApiRequestError("Select a department to load subjects.", 400);
  }
  await ensureSubjects(instituteId, semester, department);
  const result = await getPool().query<{
    id: string;
    semester: number;
    department: string;
    code: string | null;
    name: string;
    credits: string;
    maximumMarks: string;
    isPreset: boolean;
  }>(
    `SELECT id, semester, department, code, name, credits,
            maximum_marks AS "maximumMarks", is_preset AS "isPreset"
     FROM public.semester_subjects
     WHERE institute_id=$1 AND semester=$2 AND is_active=true
       AND lower(regexp_replace(trim(department), '[[:space:]_-]+', ' ', 'g')) = ANY($3::text[])
     ORDER BY lower(trim(name)), is_preset, name, code NULLS LAST`,
    [instituteId, semester, departmentFilterValues(department)],
  );
  const seenNames = new Set<string>();
  const seenCodes = new Set<string>();
  const uniqueRows = result.rows.filter((row) => {
    const name = row.name.trim().toLowerCase();
    const code = row.code?.trim().toLowerCase();
    if (seenNames.has(name) || (code && seenCodes.has(code))) return false;
    seenNames.add(name);
    if (code) seenCodes.add(code);
    return true;
  });
  const uniqueIds = new Set(uniqueRows.map((row) => row.id));
  return NextResponse.json({ data: result.rows.filter((row) => uniqueIds.has(row.id)).map((row) => ({
    ...row,
    credits: Number(row.credits),
    maximumMarks: Number(row.maximumMarks),
  })) }, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=15" },
  });
}

async function getRoster(
  instituteId: string,
  subjectId: string,
  examName: string,
  examYear: number,
) {
  const result = await getPool().query<{
    id: string;
    semester: number;
    department: string;
    name: string;
    code: string | null;
    maximumMarks: string;
    studentId: string | null;
    fullName: string | null;
    rollNumber: string | null;
    marks: string | null;
    examFullMarks: string | null;
  }>(
    `SELECT subject.id, subject.semester, subject.department, subject.name, subject.code,
            subject.maximum_marks::text AS "maximumMarks",
            student.id AS "studentId", student.full_name AS "fullName",
            student.roll_number AS "rollNumber", result.marks::text AS marks,
            COALESCE(result.exam_full_marks, subject.maximum_marks)::text AS "examFullMarks"
     FROM public.semester_subjects subject
     LEFT JOIN public.students student
       ON student.institute_id=subject.institute_id
      AND student.semester=subject.semester
      AND lower(regexp_replace(trim(student.department), '[[:space:]_-]+', ' ', 'g')) = ANY(
        CASE lower(trim(subject.department))
          WHEN 'computer technology' THEN ARRAY['computer technology', 'computer', 'cst']::text[]
          WHEN 'civil technology' THEN ARRAY['civil technology', 'civil']::text[]
          WHEN 'electrical technology' THEN ARRAY['electrical technology', 'electrical']::text[]
          WHEN 'mechanical technology' THEN ARRAY['mechanical technology', 'mechanical']::text[]
          WHEN 'electronics technology' THEN ARRAY['electronics technology', 'electronics']::text[]
          WHEN 'power technology' THEN ARRAY['power technology', 'power']::text[]
          WHEN 'marine technology' THEN ARRAY['marine technology', 'marine']::text[]
          WHEN 'architecture technology' THEN ARRAY['architecture technology', 'architecture']::text[]
          WHEN 'foundry technology' THEN ARRAY['foundry technology', 'foundry', 'ft']::text[]
          ELSE ARRAY[lower(regexp_replace(trim(subject.department), '[[:space:]_-]+', ' ', 'g'))]
        END
      )
      AND student.is_active=true AND student.approval_status='approved'
     LEFT JOIN public.semester_exam_results result
       ON result.student_id=student.id AND result.institute_id=student.institute_id
      AND result.subject_id=subject.id AND result.exam_name=$3 AND result.exam_year=$4
     WHERE subject.id=$1 AND subject.institute_id=$2 AND subject.is_active=true
     ORDER BY student.roll_number NULLS LAST, student.full_name`,
    [subjectId, instituteId, examName, examYear],
  );
  const selectedSubject = result.rows[0];
  if (!selectedSubject) throw new ApiRequestError("Subject was not found.", 404);
  return NextResponse.json({
    subject: {
      id: selectedSubject.id,
      semester: selectedSubject.semester,
      department: selectedSubject.department,
      name: selectedSubject.name,
      code: selectedSubject.code,
      maximumMarks: Number(selectedSubject.maximumMarks),
    },
    data: result.rows.flatMap((student) => student.studentId === null ? [] : [{
      id: student.studentId,
      fullName: student.fullName,
      rollNumber: student.rollNumber,
      marks: student.marks === null ? null : Number(student.marks),
      examFullMarks: Number(student.examFullMarks),
    }]),
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    assertExamManagementAccess(user.role);
    const query = request.nextUrl.searchParams;
    const instituteId = await resolveInstituteId(user, query.get("instituteId"));
    const mode = query.get("mode");
    if (mode === "departments") {
      return await getDepartments(instituteId, semesterFromQuery(query.get("semester")));
    }
    if (mode === "subjects") {
      return await getSubjects(
        instituteId,
        semesterFromQuery(query.get("semester")),
        query.get("department")?.trim() ?? "",
      );
    }
    if (mode === "roster") {
      const subjectId = query.get("subjectId") ?? "";
      if (!isUuid(subjectId)) throw new ApiRequestError("Subject selection is invalid.", 400);
      const examName = query.get("examName")?.trim() ?? "";
      if (!isExamType(examName)) {
        throw new ApiRequestError("Select Final Examination, Midterm Exam, or Class Test.", 400);
      }
      const rawYear = query.get("examYear") ?? "";
      if (!/^\d{4}$/.test(rawYear) || Number(rawYear) < 1900 || Number(rawYear) > 9999) {
        throw new ApiRequestError("Exam year must be a valid four-digit year.", 400);
      }
      return await getRoster(instituteId, subjectId, examName, Number(rawYear));
    }
    throw new ApiRequestError("Select a valid exam-results view.", 400);
  } catch (error) {
    const response = apiError(error);
    if (response) return response;
    if (error instanceof ApiRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Exam results request failed.", error);
    return NextResponse.json({ error: "Unable to load exam results." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    assertExamManagementAccess(user.role);
    const body = await readJsonBody(request, 2_000_000);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError("Exam results action is required.", 400);
    }
    const data = body as Record<string, unknown>;
    if (data.action === "createSubject") {
      let input: ReturnType<typeof validateExamSubjectInput>;
      try {
        input = validateExamSubjectInput(data);
      } catch (error) {
        if (error instanceof Error) throw new ApiRequestError(error.message, 400);
        throw error;
      }
      const instituteId = await resolveInstituteId(user, input.instituteId);
      client = await getPool().connect();
      await client.query("BEGIN");
      transactionOpen = true;
      const result = await client.query<{ id: string }>(
        `INSERT INTO public.semester_subjects
           (institute_id, semester, department, code, name, maximum_marks, is_preset, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,false,$7)
         RETURNING id`,
        [instituteId, input.semester, canonicalDepartmentLabel(input.department), input.code, input.name, input.maximumMarks, user.id],
      );
      const subjectId = result.rows[0]?.id;
      if (!subjectId) throw new Error("Subject could not be saved.");
      await client.query(
        `INSERT INTO public.admin_audit_logs
           (actor_user_id, actor_role, action, target_type, target_id, after_value)
         VALUES ($1,$2,'exam_subject.created','exam_subject',$3,$4::jsonb)`,
        [user.id, user.role.toLowerCase(), subjectId, JSON.stringify({
          semester: input.semester,
          department: input.department,
          name: input.name,
          code: input.code,
          maximumMarks: input.maximumMarks,
        })],
      );
      await client.query("COMMIT");
      transactionOpen = false;
      return NextResponse.json({ id: subjectId }, { status: 201 });
    }
    if (data.action !== "publishResults") throw new ApiRequestError("Exam results action is invalid.", 400);

    let input: ReturnType<typeof validateExamResultInput>;
    try {
      input = validateExamResultInput(data);
    } catch (error) {
      if (error instanceof Error) throw new ApiRequestError(error.message, 400);
      throw error;
    }
    const instituteId = await resolveInstituteId(user, input.instituteId);
    client = await getPool().connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const subjectResult = await client.query<{
      id: string;
      semester: number;
      department: string;
      name: string;
    }>(
      `SELECT id, semester, department, name
       FROM public.semester_subjects
       WHERE id=$1 AND institute_id=$2 AND is_active=true
       FOR SHARE`,
      [input.subjectId, instituteId],
    );
    const subject = subjectResult.rows[0];
    if (!subject) throw new ApiRequestError("Subject was not found.", 404);
    const roster = await client.query<{ id: string; full_name: string | null; roll_number: string | null }>(
      `SELECT id, full_name, roll_number
       FROM public.students
       WHERE institute_id=$1 AND semester=$2 AND lower(trim(department)) = ANY($3::text[])
         AND is_active=true AND approval_status='approved'
       FOR SHARE`,
      [instituteId, subject.semester, departmentFilterValues(subject.department)],
    );
    const selectedIds = new Set(input.records.map((record) => record.studentId));
    if (roster.rowCount !== input.records.length || roster.rows.some((student) => !selectedIds.has(student.id))) {
      throw new ApiRequestError("Results must include every currently enrolled student in this semester and department.", 409);
    }
    await client.query(
      `INSERT INTO public.semester_exam_results
         (institute_id, subject_id, student_id, semester, department, exam_name, exam_year,
          exam_full_marks, marks, grade_point, letter_grade, status, created_by, published_at)
       SELECT $1, $2, entry.student_id, $3, $4, $5, $6, $7,
              entry.marks, NULL, NULL, 'published', $8, now()
       FROM unnest($9::uuid[], $10::numeric[])
         AS entry(student_id, marks)
       ON CONFLICT (institute_id, subject_id, student_id, exam_year, exam_name)
       DO UPDATE SET semester=EXCLUDED.semester, department=EXCLUDED.department,
                     exam_full_marks=EXCLUDED.exam_full_marks,
                     marks=EXCLUDED.marks, grade_point=NULL,
                     letter_grade=NULL, status='published',
                     created_by=EXCLUDED.created_by, published_at=now(), updated_at=now()`,
      [
        instituteId,
        subject.id,
        subject.semester,
        subject.department,
        input.examName,
        input.examYear,
        input.examFullMarks,
        user.id,
        input.records.map((record) => record.studentId),
        input.records.map((record) => record.marks),
      ],
    );
    await client.query(
      `INSERT INTO public.admin_audit_logs
         (actor_user_id, actor_role, action, target_type, target_id, after_value)
       VALUES ($1,$2,'exam_results.published','exam_subject',$3,$4::jsonb)`,
      [user.id, user.role.toLowerCase(), subject.id, JSON.stringify({
        semester: subject.semester,
        department: subject.department,
        subject: subject.name,
        examName: input.examName,
        examYear: input.examYear,
        examFullMarks: input.examFullMarks,
        studentCount: input.records.length,
      })],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    return NextResponse.json({ published: input.records.length, subjectId: subject.id });
  } catch (error) {
    if (client && transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "A subject with this name or code already exists in the selected semester and department." }, { status: 409 });
    }
    const response = apiError(error);
    if (response) return response;
    if (error instanceof ApiRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Exam results save failed.", error);
    return NextResponse.json({ error: "Unable to save exam results." }, { status: 500 });
  } finally {
    client?.release();
  }
}
