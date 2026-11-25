import ExcelJS from "exceljs";
import { connectToTestDatabase } from "./test-db-safety.ts";
import {
  mapStudentImportRow,
  normalizeOptionalImportFields,
} from "../src/lib/students/import-mapping.ts";
import { validateStudentInput } from "../src/lib/students/validation.ts";

const WORKBOOK_PATH = "C:\\Users\\WALTON\\Documents\\one_school_one_class_30_students.xlsx";
const INSTITUTE_SLUG = "amrpi-synthetic-workbook-test";
const SOURCE_PREFIX = "one_school_one_class_30_students.xlsx:30 Students:";
const BENGALI_DIGITS: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

function cellText(row: ExcelJS.Row, column: number) {
  return row.getCell(column).text.trim();
}

function readSemester(value: string) {
  const ascii = value.replace(/[০-৯]/g, (digit) => BENGALI_DIGITS[digit] ?? digit);
  const match = ascii.match(/([1-8])/);
  if (!match) throw new Error("Workbook contains a row without a supported semester.");
  return Number(match[1]);
}

function readSession(value: string) {
  const match = value.match(/\b(?:19|20)\d{2}(?:-(?:(?:19|20)\d{2}|\d{2}))?\b/);
  if (!match) throw new Error("Workbook does not contain a valid academic session.");
  return match[0];
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(WORKBOOK_PATH);
const sheet = workbook.getWorksheet("30 Students");
if (!sheet || sheet.actualRowCount !== 31) {
  throw new Error("Expected the synthetic '30 Students' worksheet with exactly 30 student rows.");
}

const headerRow = sheet.getRow(1);
const headers = Array.from({ length: headerRow.cellCount }, (_, index) =>
  cellText(headerRow, index + 1),
);
const students = [];
for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
  const row = sheet.getRow(rowNumber);
  const cells = Array.from({ length: headers.length }, (_, index) =>
    cellText(row, index + 1),
  );
  const mapped = mapStudentImportRow(
    headers.map((header) => header.match(/\(([^()]*)\)/)?.[1] ?? header),
    cells,
  );
  mapped.address = cellText(row, 10);
  const student = validateStudentInput({
    ...normalizeOptionalImportFields(mapped),
    semester: readSemester(cellText(row, 3)),
    department: null,
    sessionYear: readSession(cellText(row, 4)),
    status: "active",
  });
  if (!student.fullName || !student.rollNumber || !student.registrationNumber) {
    throw new Error(`Synthetic workbook row ${rowNumber} is missing required identity data.`);
  }
  students.push({ rowNumber, student });
}
if (students.length !== 30) throw new Error("Synthetic workbook import must contain exactly 30 students.");

const client = await connectToTestDatabase();
try {
  await client.query("BEGIN");
  const instituteResult = await client.query<{ id: string; name: string }>(
    `INSERT INTO public.institutes (name, slug, category, type, review_status)
     VALUES ('AMRPI Synthetic Test Institute', $1, 'polytechnic', 'polytechnic', 'approved')
     ON CONFLICT (slug) DO NOTHING
     RETURNING id, name`,
    [INSTITUTE_SLUG],
  );
  const institute = instituteResult.rows[0] ?? (await client.query<{ id: string; name: string }>(
    "SELECT id, name FROM public.institutes WHERE slug = $1 FOR UPDATE",
    [INSTITUTE_SLUG],
  )).rows[0];
  if (!institute || institute.name !== "AMRPI Synthetic Test Institute") {
    throw new Error("Refusing to overwrite an unexpected institute in the isolated test database.");
  }

  for (const { rowNumber, student } of students) {
    const sourceKey = `${SOURCE_PREFIX}${rowNumber}`;
    const inserted = await client.query(
      `INSERT INTO public.students
         (institute_id, semester, department, session_year, full_name, roll_number,
          registration_number, email, date_of_birth, guardian_name, guardian_contact,
          student_phone, father_name, mother_name, father_phone, mother_phone,
          address, is_active, approval_status, test_source_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true,'approved',$18)
       ON CONFLICT (test_source_key) DO UPDATE
       SET semester = EXCLUDED.semester,
           department = EXCLUDED.department,
           session_year = EXCLUDED.session_year,
           full_name = EXCLUDED.full_name,
           roll_number = EXCLUDED.roll_number,
           registration_number = EXCLUDED.registration_number,
           email = EXCLUDED.email,
           guardian_contact = EXCLUDED.guardian_contact,
           father_name = EXCLUDED.father_name,
           mother_name = EXCLUDED.mother_name,
           address = EXCLUDED.address,
           is_active = true,
           approval_status = 'approved',
           updated_at = now()
       WHERE public.students.institute_id = EXCLUDED.institute_id
       RETURNING id`,
      [
        institute.id,
        student.semester,
        student.department,
        student.sessionYear,
        student.fullName,
        student.rollNumber,
        student.registrationNumber,
        student.email,
        student.dateOfBirth,
        student.guardianName,
        student.guardianContact,
        student.studentPhone,
        student.fatherName,
        student.motherName,
        student.fatherPhone,
        student.motherPhone,
        student.address,
        sourceKey,
      ],
    );
    if (!inserted.rowCount) throw new Error(`Test import source key ${rowNumber} belongs to another institute.`);
  }

  const verified = await client.query<{
    total: string;
    linked_to_institute: string;
    active_approved: string;
    unique_rolls: string;
    unique_registrations: string;
    parent_names_present: string;
    guardian_contacts_present: string;
    student_phones_absent: string;
  }>(
    `SELECT count(*)::text AS total,
       count(*) FILTER (WHERE student.institute_id = $1)::text AS linked_to_institute,
       count(*) FILTER (WHERE student.is_active AND student.approval_status = 'approved')::text AS active_approved,
       count(DISTINCT lower(trim(student.roll_number)))::text AS unique_rolls,
       count(DISTINCT lower(trim(student.registration_number)))::text AS unique_registrations,
       count(*) FILTER (WHERE student.father_name IS NOT NULL AND student.mother_name IS NOT NULL)::text AS parent_names_present,
       count(*) FILTER (WHERE student.guardian_contact IS NOT NULL)::text AS guardian_contacts_present,
       count(*) FILTER (WHERE student.student_phone IS NULL)::text AS student_phones_absent
     FROM public.students student
     WHERE student.institute_id = $1 AND student.test_source_key LIKE $2`,
    [institute.id, `${SOURCE_PREFIX}%`],
  );
  const counts = verified.rows[0];
  const expected = "30";
  if (
    !counts ||
    counts.total !== expected ||
    counts.linked_to_institute !== expected ||
    counts.active_approved !== expected ||
    counts.unique_rolls !== expected ||
    counts.unique_registrations !== expected ||
    counts.parent_names_present !== expected ||
    counts.guardian_contacts_present !== expected ||
    counts.student_phones_absent !== expected
  ) {
    throw new Error("Imported student records failed relationship or field verification.");
  }
  await client.query("COMMIT");
  console.info(JSON.stringify({
    database: "amrpi_test",
    instituteId: institute.id,
    imported: Number(counts.total),
    linkedToTestInstitute: Number(counts.linked_to_institute),
    activeApproved: Number(counts.active_approved),
    uniqueRollNumbers: Number(counts.unique_rolls),
    uniqueRegistrationNumbers: Number(counts.unique_registrations),
    fatherAndMotherNamesPresent: Number(counts.parent_names_present),
    guardianContactsPresent: Number(counts.guardian_contacts_present),
    studentPhoneMissingInSource: Number(counts.student_phones_absent),
  }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
