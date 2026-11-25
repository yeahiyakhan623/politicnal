import assert from "node:assert/strict";
import test from "node:test";
import { validateStudentInput } from "./validation.ts";

test("accepts a student identified by a name without requiring optional fields", () => {
  const student = validateStudentInput({ fullName: "  Amina Rahman  ", semester: "2nd Semester" });

  assert.equal(student.fullName, "Amina Rahman");
  assert.equal(student.rollNumber, "");
  assert.equal(student.registrationNumber, "");
  assert.equal(student.semester, 2);
  assert.equal(student.department, null);
  assert.equal(student.motherPhone, null);
});

test("accepts a roll number when a student name is missing", () => {
  const student = validateStudentInput({ rollNumber: "230101", semester: 8, studentPhone: "+8801", sessionYear: "2024-25" });

  assert.equal(student.fullName, "");
  assert.equal(student.rollNumber, "230101");
  assert.equal(student.semester, 8);
  assert.equal(student.studentPhone, "+8801");
  assert.equal(student.sessionYear, "2024-25");
});

test("requires a name or roll and restricts semesters to one through eight", () => {
  assert.throws(() => validateStudentInput({ semester: 1 }), /student name or roll/);
  assert.throws(() => validateStudentInput({ fullName: "Student", semester: 9 }), /Semester must be between 1 and 8/);
  assert.throws(() => validateStudentInput({ fullName: "Student", sessionYear: "24/25" }), /Session year/);
});

test("rejects malformed optional email and dates without requiring either field", () => {
  assert.throws(() => validateStudentInput({ fullName: "Student", email: "not-an-email" }), /Email address is invalid/);
  assert.throws(() => validateStudentInput({ fullName: "Student", dateOfBirth: "2026-02-30" }), /Date of birth/);
  assert.doesNotThrow(() => validateStudentInput({ fullName: "Student" }));
});
