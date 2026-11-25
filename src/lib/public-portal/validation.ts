export const PUBLIC_EXAM_TYPES = ["Final Examination", "Midterm Exam", "Class Test"] as const;

export type PublicResultSearch = {
  instituteId: string;
  sessionYear: string;
  semester: number;
  department: string;
  examType: typeof PUBLIC_EXAM_TYPES[number];
  searchBy: "rollNumber" | "studentName" | "registrationNumber";
  searchValue: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validatePublicResultSearch(value: unknown): PublicResultSearch {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Enter the result search criteria.");
  }
  const data = value as Record<string, unknown>;
  const instituteId = typeof data.instituteId === "string" ? data.instituteId : "";
  const sessionYear = typeof data.sessionYear === "string" ? data.sessionYear.trim() : "";
  const semester = typeof data.semester === "number" ? data.semester
    : typeof data.semester === "string" && /^\d+$/.test(data.semester) ? Number(data.semester)
      : Number.NaN;
  const department = typeof data.department === "string" ? data.department.trim() : "";
  const examType = typeof data.examType === "string" ? data.examType.trim() : "";
  if (!UUID.test(instituteId)) throw new Error("Select a valid institute.");
  if (sessionYear.length < 1 || sessionYear.length > 20) throw new Error("Select an academic session.");
  if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
    throw new Error("Select a semester from 1 to 8.");
  }
  if (!department || department.length > 100) throw new Error("Select a department or technology.");
  if (!PUBLIC_EXAM_TYPES.some((item) => item === examType)) throw new Error("Select a valid exam type.");

  const identifiers = [
    ["rollNumber", typeof data.rollNumber === "string" ? data.rollNumber.trim() : ""],
    ["studentName", typeof data.studentName === "string" ? data.studentName.trim() : ""],
    ["registrationNumber", typeof data.registrationNumber === "string" ? data.registrationNumber.trim() : ""],
  ] as const;
  const matched = identifiers.filter(([, identifier]) => Boolean(identifier));
  if (matched.length !== 1) {
    throw new Error("Search using exactly one: roll number, student name, or registration number.");
  }
  const [searchBy, searchValue] = matched[0]!;
  if (searchValue.length > 150) throw new Error("Search value must be 150 characters or fewer.");
  return {
    instituteId,
    sessionYear,
    semester,
    department,
    examType: examType as PublicResultSearch["examType"],
    searchBy,
    searchValue,
  };
}
