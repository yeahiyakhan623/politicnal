export type StudentInput = {
  instituteId?: string;
  fullName: string;
  rollNumber: string;
  registrationNumber: string;
  email: string | null;
  dateOfBirth: string | null;
  guardianName: string | null;
  guardianContact: string | null;
  studentPhone: string | null;
  fatherName: string | null;
  motherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  address: string | null;
  department: string | null;
  semester: number;
  sessionYear: string | null;
  status: "active" | "inactive" | "pending" | "rejected";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readString(value: unknown, name: string, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const result = value.trim();
  if (!result) return null;
  if (result.length > maxLength) throw new Error(`${name} must be ${maxLength} characters or fewer.`);
  return result;
}

export function validateStudentInput(value: unknown): StudentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Student details must be sent as an object.");
  }
  const data = value as Record<string, unknown>;
  const fullName = readString(data.fullName, "Full name", 160) ?? "";
  const rollNumber = readString(data.rollNumber, "Roll number", 40) ?? "";
  const registrationNumber = readString(data.registrationNumber, "Registration number", 80) ?? "";
  if (!fullName && !rollNumber) throw new Error("Provide a student name or roll number.");
  const email = readString(data.email, "Email", 254);
  const dateOfBirth = readString(data.dateOfBirth, "Date of birth", 10);
  const guardianName = readString(data.guardianName, "Guardian name", 160);
  const guardianContact = readString(data.guardianContact, "Guardian contact", 30);
  const studentPhone = readString(data.studentPhone, "Student phone", 30);
  const fatherName = readString(data.fatherName, "Father name", 160);
  const motherName = readString(data.motherName, "Mother name", 160);
  const fatherPhone = readString(data.fatherPhone, "Father phone", 30);
  const motherPhone = readString(data.motherPhone, "Mother phone", 30);
  const address = readString(data.address, "Address", 500);
  const department = readString(data.department, "Department", 100);
  const sessionYear = readString(data.sessionYear, "Session year", 20);
  const rawSemester = data.semester === undefined || data.semester === "" ? 1 : data.semester;
  const semesterText = typeof rawSemester === "string" ? rawSemester.trim() : "";
  const semesterLabel = semesterText.match(/^([1-8])(?:st|nd|rd|th)?(?:\s+semester)?$/i);
  const semester = typeof rawSemester === "number"
    ? rawSemester
    : semesterLabel
      ? Number(semesterLabel[1])
      : Number(rawSemester);
  const statusValue = data.status === undefined ? "active" : data.status;
  if (typeof data.instituteId === "string" && !UUID.test(data.instituteId)) {
    throw new Error("Institute selection is invalid.");
  }
  if (!Number.isInteger(semester) || semester < 1 || semester > 8) throw new Error("Semester must be between 1 and 8.");
  if (sessionYear && !/^(?:\d{4}|\d{4}-\d{2}|\d{4}-\d{4})$/.test(sessionYear)) {
    throw new Error("Session year must be a year or a year range such as 2024-25.");
  }
  if (email && !EMAIL.test(email)) throw new Error("Email address is invalid.");
  if (dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ||
      Number.isNaN(Date.parse(`${dateOfBirth}T00:00:00Z`)) ||
      new Date(`${dateOfBirth}T00:00:00Z`).toISOString().slice(0, 10) !== dateOfBirth)) {
    throw new Error("Date of birth must be a valid YYYY-MM-DD date.");
  }
  if (!["active", "inactive", "pending", "rejected"].includes(String(statusValue))) {
    throw new Error("Student status is invalid.");
  }

  return {
    instituteId: typeof data.instituteId === "string" ? data.instituteId : undefined,
    fullName,
    rollNumber,
    registrationNumber,
    email,
    dateOfBirth,
    guardianName,
    guardianContact,
    studentPhone,
    fatherName,
    motherName,
    fatherPhone,
    motherPhone,
    address,
    department,
    semester,
    sessionYear,
    status: statusValue as StudentInput["status"],
  };
}

export function validateStudentId(value: string) {
  if (!UUID.test(value)) throw new Error("Student record ID is invalid.");
}
