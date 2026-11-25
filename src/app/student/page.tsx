import { StudentPortal } from "@/components/student-portal";
import { getCurrentSession } from "@/lib/auth/session";
import { getStudentForUser } from "@/lib/students/service";
import { getPool } from "@/lib/db";
import { calculateGpa, type GradedSubject } from "@/lib/grading";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role !== "STUDENT") redirect("/");

  const record = await getStudentForUser(session.id, session.studentId);
  const [results, attendanceSummary, recentAttendance, fees] = record && session.instituteId
    ? await Promise.all([
      getPool().query<{
        id: string;
        subjectId: string;
        subjectName: string;
        subjectCode: string | null;
        credits: string;
        semester: number;
        examName: string;
        examYear: number;
        marks: string | null;
        fullMarks: string;
        gradePoint: string | null;
        letterGrade: string | null;
        publishedAt: Date | string | null;
      }>(
        `SELECT result.id, subject.id AS "subjectId",
                subject.name AS "subjectName", subject.code AS "subjectCode",
                subject.credits::text AS credits, result.semester,
                result.exam_name AS "examName", result.exam_year AS "examYear",
                result.marks, result.exam_full_marks AS "fullMarks",
                result.grade_point AS "gradePoint", result.letter_grade AS "letterGrade",
                result.published_at AS "publishedAt"
         FROM public.semester_exam_results result
         JOIN public.semester_subjects subject
           ON subject.id = result.subject_id AND subject.institute_id = result.institute_id
         WHERE result.student_id = $1 AND result.institute_id = $2
           AND result.status = 'published'
         ORDER BY result.exam_year DESC, result.published_at DESC, subject.name
         LIMIT 100`,
        [record.id, session.instituteId],
      ),
      getPool().query<{ total: string; present: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE status = 'present')::text AS present
         FROM public.attendance_records
         WHERE student_id = $1 AND institute_id = $2`,
        [record.id, session.instituteId],
      ),
      getPool().query<{
        attendanceDate: string;
        status: "present" | "absent";
        department: string;
        semester: number;
      }>(
        `SELECT attendance_date::text AS "attendanceDate", status, department, semester
         FROM public.attendance_records
         WHERE student_id = $1 AND institute_id = $2
         ORDER BY attendance_date DESC
         LIMIT 12`,
        [record.id, session.instituteId],
      ),
      getPool().query<{
        sessionYear: string;
        semester: number;
        feeAmount: string;
        paidAmount: string;
      }>(
        `SELECT session_year AS "sessionYear", semester,
                fee_amount::text AS "feeAmount", paid_amount::text AS "paidAmount"
         FROM public.student_fee_summaries
         WHERE student_id = $1 AND institute_id = $2
         ORDER BY session_year DESC, semester DESC`,
        [record.id, session.instituteId],
      ),
    ])
    : [null, null, null, null];
  const attendanceCounts = attendanceSummary?.rows[0];
  const gradeRows = results?.rows ?? [];
  const semesterGradeGroups = new Map<string, {
    semester: number;
    examName: string;
    examYear: number;
    subjects: GradedSubject[];
  }>();
  const latestSubjectGrades = new Map<string, { publishedAt: Date | string | null; examYear: number; subject: GradedSubject }>();
  for (const result of gradeRows) {
    if (result.gradePoint === null || Number(result.credits) <= 0) continue;
    const subject = { credit: Number(result.credits), gradePoint: Number(result.gradePoint) };
    const key = `${result.semester}:${result.examYear}:${result.examName}`;
    const group = semesterGradeGroups.get(key) ?? {
      semester: result.semester,
      examName: result.examName,
      examYear: result.examYear,
      subjects: [],
    };
    group.subjects.push(subject);
    semesterGradeGroups.set(key, group);
    const current = latestSubjectGrades.get(result.subjectId);
    const publishedAt = result.publishedAt ? new Date(result.publishedAt).getTime() : 0;
    const currentPublishedAt = current?.publishedAt ? new Date(current.publishedAt).getTime() : 0;
    if (!current || publishedAt > currentPublishedAt || (publishedAt === currentPublishedAt && result.examYear > current.examYear)) {
      latestSubjectGrades.set(result.subjectId, { publishedAt: result.publishedAt, examYear: result.examYear, subject });
    }
  }
  const semesterGpas = [...semesterGradeGroups.values()].map((group) => ({
    semester: group.semester,
    examName: group.examName,
    examYear: group.examYear,
    gpa: calculateGpa(group.subjects).gpa,
  }));
  const cumulativeGpaSubjects = [...latestSubjectGrades.values()].map(({ subject }) => subject);
  const cgpa = cumulativeGpaSubjects.length ? calculateGpa(cumulativeGpaSubjects).gpa : null;
  return <StudentPortal student={record ? {
    name: record.fullName,
    email: record.email,
    phone: record.studentPhone,
    roll: record.rollNumber,
    registration: record.registrationNumber,
    department: record.department ?? "Not provided",
    semester: `${record.semester}${record.semester === 1 ? "st" : record.semester === 2 ? "nd" : record.semester === 3 ? "rd" : "th"} Semester`,
    sessionYear: record.sessionYear ?? "Not provided",
    instituteId: session.instituteId,
  } : null}
  results={results?.rows.map((result) => ({
    ...result,
    credits: Number(result.credits),
    marks: result.marks === null ? null : Number(result.marks),
    fullMarks: Number(result.fullMarks),
    gradePoint: result.gradePoint === null ? null : Number(result.gradePoint),
    publishedAt: result.publishedAt ? new Date(result.publishedAt).toISOString() : null,
  })) ?? []}
  semesterGpas={semesterGpas}
  cgpa={cgpa}
  attendance={{
    total: Number(attendanceCounts?.total ?? 0),
    present: Number(attendanceCounts?.present ?? 0),
    records: recentAttendance?.rows ?? [],
  }}
  fees={fees?.rows.map((fee) => ({
    ...fee,
    feeAmount: Number(fee.feeAmount),
    paidAmount: Number(fee.paidAmount),
    dueAmount: Number(fee.feeAmount) - Number(fee.paidAmount),
  })) ?? []}
  passwordChangeRequired={session.passwordChangeRequired} />;
}
