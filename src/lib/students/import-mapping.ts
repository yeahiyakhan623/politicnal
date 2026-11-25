const HEADER_FIELDS: Record<string, string[]> = {
  fullName: [
    "name",
    "student name",
    "student full name",
    "full name",
    "fullName",
    "full_name",
    "fullname",
    "candidate name",
  ],
  rollNumber: [
    "roll",
    "roll no",
    "roll number",
    "roll_no",
    "roll_number",
    "rollno",
    "student roll",
    "student roll no",
    "student roll number",
  ],
  registrationNumber: [
    "registration",
    "registration no",
    "registration number",
    "registration_no",
    "registration_number",
    "registration id",
    "reg",
    "reg no",
    "reg number",
  ],
  email: ["email", "email address", "student email", "e-mail"],
  dateOfBirth: ["date of birth", "date_of_birth", "dob", "birth date"],
  guardianName: ["guardian", "guardian name", "guardian's name"],
  guardianContact: ["guardian contact", "guardian phone", "guardian mobile"],
  studentPhone: ["phone", "phone number", "mobile", "mobile number", "contact", "contact number", "contact phone number", "contact/phone number", "phone/contact number", "student contact number", "student phone", "student mobile"],
  fatherName: ["father", "father name", "father's name", "father full name", "father's full name"],
  motherName: ["mother", "mother name", "mother's name", "mother full name", "mother's full name"],
  fatherPhone: ["father phone", "father's phone", "father mobile", "father contact"],
  motherPhone: ["mother phone", "mother's phone", "mother mobile", "mother contact"],
  sessionYear: ["session", "session year", "session_year", "admission year", "entry year"],
  address: ["address", "home address", "present address"],
};

const HEADER_ALIASES = new Map(
  Object.entries(HEADER_FIELDS).flatMap(([field, aliases]) =>
    aliases.map((alias) => [normalizeImportHeader(alias), field] as const),
  ),
);

const OPTIONAL_LIMITS: Record<string, number> = {
  registrationNumber: 80,
  email: 254,
  dateOfBirth: 10,
  guardianName: 160,
  guardianContact: 30,
  studentPhone: 30,
  fatherName: 160,
  motherName: 160,
  fatherPhone: 30,
  motherPhone: 30,
  sessionYear: 20,
  address: 500,
};

export function normalizeImportHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getStudentImportField(header: string) {
  return HEADER_ALIASES.get(normalizeImportHeader(header)) ?? null;
}

export function mapStudentImportRow(headers: readonly string[], cells: readonly string[]) {
  const mapped: Record<string, string> = {};
  headers.forEach((header, index) => {
    const field = getStudentImportField(header);
    const value = cells[index]?.trim() ?? "";
    if (field && value && !mapped[field]) mapped[field] = value;
  });
  return mapped;
}

export function normalizeOptionalImportFields(fields: Record<string, string>) {
  const normalized = { ...fields };
  for (const [field, maximum] of Object.entries(OPTIONAL_LIMITS)) {
    normalized[field] = (normalized[field] ?? "").trim().slice(0, maximum);
  }
  if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    normalized.email = "";
  }
  if (normalized.dateOfBirth && (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized.dateOfBirth) ||
    Number.isNaN(Date.parse(`${normalized.dateOfBirth}T00:00:00Z`)) ||
    new Date(`${normalized.dateOfBirth}T00:00:00Z`).toISOString().slice(0, 10) !== normalized.dateOfBirth
  )) {
    normalized.dateOfBirth = "";
  }
  if (normalized.sessionYear && !/^(?:\d{4}|\d{4}-\d{2}|\d{4}-\d{4})$/.test(normalized.sessionYear)) {
    normalized.sessionYear = "";
  }
  return normalized;
}
