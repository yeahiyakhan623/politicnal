import assert from "node:assert/strict";
import test from "node:test";
import {
  getStudentImportField,
  mapStudentImportRow,
  normalizeOptionalImportFields,
} from "./import-mapping.ts";
import { validateStudentInput } from "./validation.ts";

test("maps common header variants without case sensitivity", () => {
  assert.equal(getStudentImportField("Student Name"), "fullName");
  assert.equal(getStudentImportField("STUDENT_name"), "fullName");
  assert.equal(getStudentImportField("roll_no"), "rollNumber");
  assert.equal(getStudentImportField("Roll No."), "rollNumber");
  assert.equal(getStudentImportField("REGISTRATION NUMBER"), "registrationNumber");
  assert.equal(getStudentImportField("Mobile Number"), "studentPhone");
  assert.equal(getStudentImportField("Contact/Phone Number"), "studentPhone");
  assert.equal(getStudentImportField("Father's Name"), "fatherName");
  assert.equal(getStudentImportField("Mother's Name"), "motherName");
});

test("maps parent names and combined contact headers from imported rows", () => {
  const mapped = mapStudentImportRow(
    ["Name", "Father's Name", "Mother's Name", "Contact/Phone Number"],
    ["Raihan Ahmed", "Abdul Karim", "Ayesha Karim", "+8801800000000"],
  );
  const student = validateStudentInput({
    ...normalizeOptionalImportFields(mapped),
    semester: 1,
    department: "Computer Technology",
    status: "active",
  });
  assert.equal(student.fatherName, "Abdul Karim");
  assert.equal(student.motherName, "Ayesha Karim");
  assert.equal(student.studentPhone, "+8801800000000");
});

test("maps rows with missing and blank optional cells", () => {
  const mapped = mapStudentImportRow(
    ["Name", "roll_no", "Phone Number", "Email", "Guardian Name", "Address"],
    ["Raihan Ahmed", "R-21", "", "", "", ""],
  );
  assert.deepEqual(mapped, { fullName: "Raihan Ahmed", rollNumber: "R-21" });
  const student = validateStudentInput({
    ...normalizeOptionalImportFields(mapped),
    semester: 3,
    department: "Electrical Technology",
    status: "active",
  });
  assert.equal(student.fullName, "Raihan Ahmed");
  assert.equal(student.rollNumber, "R-21");
  assert.equal(student.studentPhone, null);
  assert.equal(student.email, null);
  assert.equal(student.semester, 3);
  assert.equal(student.department, "Electrical Technology");
});

test("uses a populated alias when an earlier duplicate header is blank", () => {
  const mapped = mapStudentImportRow(
    ["Name", "Student Name", "Roll", "Roll No."],
    ["", "Raihan Ahmed", "", "R-21"],
  );
  assert.deepEqual(mapped, { fullName: "Raihan Ahmed", rollNumber: "R-21" });
});

test("drops malformed optional values instead of making a student row invalid", () => {
  const normalized = normalizeOptionalImportFields({
    fullName: "Raihan Ahmed",
    rollNumber: "R-21",
    email: "not-an-email",
    dateOfBirth: "unknown",
    sessionYear: "Class 2024",
    studentPhone: "1".repeat(40),
    address: "",
  });
  assert.equal(normalized.fullName, "Raihan Ahmed");
  assert.equal(normalized.email, "");
  assert.equal(normalized.dateOfBirth, "");
  assert.equal(normalized.sessionYear, "");
  assert.equal(normalized.studentPhone.length, 30);
  assert.doesNotThrow(() => validateStudentInput({
    ...normalized,
    semester: 1,
    department: "Computer Technology",
    status: "active",
  }));
});
