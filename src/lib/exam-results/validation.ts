import type { ExamResultInput, ExamSubjectInput } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EXAM_TYPES = ["Final Examination", "Midterm Exam", "Class Test"] as const;

export function isExamType(value: string): value is typeof EXAM_TYPES[number] {
  return EXAM_TYPES.some((examType) => examType === value);
}

function requiredText(value: unknown, label: string, maximum: number) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  const result = value.trim();
  if (result.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return result;
}

function semesterValue(value: unknown) {
  const semester = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(semester) || Number(semester) < 1 || Number(semester) > 8) {
    throw new Error("Semester must be between 1 and 8.");
  }
  return Number(semester);
}

function optionalNumber(value: unknown, label: string, maximum: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < 0 || number > maximum ||
    Math.abs(number * 100 - Math.round(number * 100)) > 0.0000001) {
    throw new Error(`${label} must be a number between 0 and ${maximum} with at most two decimal places.`);
  }
  return number;
}

export function validateExamSubjectInput(value: unknown): ExamSubjectInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Subject details must be sent as an object.");
  }
  const data = value as Record<string, unknown>;
  const instituteId = requiredText(data.instituteId, "Institute", 36);
  if (!UUID.test(instituteId)) throw new Error("Institute selection is invalid.");
  const department = requiredText(data.department, "Department", 100);
  const name = requiredText(data.name, "Subject name", 160);
  const code = requiredText(data.code, "Subject code", 40);
  const maximumMarks = optionalNumber(data.maximumMarks ?? 100, "Maximum marks", 9999.99);
  if (!maximumMarks || maximumMarks <= 0) throw new Error("Maximum marks must be greater than zero.");
  return {
    instituteId,
    semester: semesterValue(data.semester),
    department,
    name,
    code,
    maximumMarks,
  };
}

export function validateExamResultInput(value: unknown): ExamResultInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Result details must be sent as an object.");
  }
  const data = value as Record<string, unknown>;
  const instituteId = requiredText(data.instituteId, "Institute", 36);
  const subjectId = requiredText(data.subjectId, "Subject", 36);
  if (!UUID.test(instituteId) || !UUID.test(subjectId)) throw new Error("Institute or subject selection is invalid.");
  const examName = requiredText(data.examName, "Exam type", 120);
  if (!isExamType(examName)) {
    throw new Error("Exam type must be Final Examination, Midterm Exam, or Class Test.");
  }
  const examFullMarks = optionalNumber(data.examFullMarks, "Full marks", 9999.99);
  if (examFullMarks === null || examFullMarks <= 0) throw new Error("Full marks must be greater than zero.");
  const examYear = typeof data.examYear === "string" && /^\d{4}$/.test(data.examYear) ? Number(data.examYear) : data.examYear;
  if (!Number.isInteger(examYear) || Number(examYear) < 1900 || Number(examYear) > 9999) {
    throw new Error("Exam year must be a valid four-digit year.");
  }
  if (!Array.isArray(data.records) || data.records.length === 0 || data.records.length > 5000) {
    throw new Error("Results must include between 1 and 5000 student rows.");
  }
  const seen = new Set<string>();
  const records = data.records.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("A student result row is invalid.");
    }
    const record = value as Record<string, unknown>;
    const studentId = requiredText(record.studentId, "Student", 36);
    if (!UUID.test(studentId) || seen.has(studentId)) throw new Error("A student result selection is invalid or duplicated.");
    seen.add(studentId);
    const marks = optionalNumber(record.marks, "Marks", examFullMarks);
    if (marks === null) throw new Error("Enter marks for every student.");
    return { studentId, marks };
  });
  return { instituteId, subjectId, examName, examYear: Number(examYear), examFullMarks, records };
}

export function isUuid(value: string) {
  return UUID.test(value);
}
