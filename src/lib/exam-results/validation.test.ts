import assert from "node:assert/strict";
import test from "node:test";
import { validateExamResultInput, validateExamSubjectInput } from "./validation.ts";

const instituteId = "2bfde164-609e-4e56-9b96-b5b188a2d712";
const subjectId = "541992ce-13db-4fc6-84e8-1db2d9a24bc0";
const studentId = "eff61646-e006-4fc7-8fd5-273438a52d7f";

test("validates a semester subject with a name, code, and maximum marks", () => {
  const subject = validateExamSubjectInput({
    instituteId, semester: "2", department: "Computer Technology",
    name: "Programming", code: "CT-201", maximumMarks: 80,
  });
  assert.equal(subject.semester, 2);
  assert.equal(subject.maximumMarks, 80);
});

test("requires valid semester subject identity fields", () => {
  assert.throws(() => validateExamSubjectInput({
    instituteId, semester: 9, department: "Computer Technology", name: "Programming", code: "CT-201",
  }), /Semester/);
  assert.throws(() => validateExamSubjectInput({
    instituteId, semester: 1, department: "Computer Technology", name: "Programming", code: "",
  }), /Subject code/);
});

test("accepts the configured exam type, full marks, and marks-only result rows", () => {
  const result = validateExamResultInput({
    instituteId, subjectId, examName: "Final Examination", examYear: 2026, examFullMarks: 100,
    records: [{ studentId, marks: 78 }],
  });
  assert.equal(result.records[0].marks, 78);
  assert.equal(result.examFullMarks, 100);
});

test("accepts supported exam types and common two-decimal marks", () => {
  for (const examName of ["Final Examination", "Midterm Exam", "Class Test"]) {
    const exam = validateExamResultInput({
      instituteId, subjectId, examName, examYear: 2026, examFullMarks: 20,
      records: [{ studentId, marks: 10 }],
    });
    assert.equal(exam.examName, examName);
  }
  const result = validateExamResultInput({
    instituteId, subjectId, examName: "Midterm Exam", examYear: "2026", examFullMarks: "50",
    records: [{ studentId, marks: "41.25" }],
  });
  assert.equal(result.records[0].marks, 41.25);
  assert.equal(result.examFullMarks, 50);
});

test("rejects invalid exam types, full marks, marks, years, and duplicate students", () => {
  assert.throws(() => validateExamResultInput({
    instituteId, subjectId, examName: "Quiz", examYear: 2026, examFullMarks: 20,
    records: [{ studentId, marks: 10 }],
  }), /Exam type/);
  assert.throws(() => validateExamResultInput({
    instituteId, subjectId, examName: "Class Test", examYear: 2026, examFullMarks: 0,
    records: [{ studentId, marks: 0 }],
  }), /Full marks/);
  assert.throws(() => validateExamResultInput({
    instituteId, subjectId, examName: "Final Examination", examYear: 2026, examFullMarks: 20,
    records: [{ studentId, marks: "" }],
  }), /Enter marks/);
  assert.throws(() => validateExamResultInput({
    instituteId, subjectId, examName: "Final Examination", examYear: 2026, examFullMarks: 20,
    records: [{ studentId, marks: 20.01 }],
  }), /Marks/);
  assert.throws(() => validateExamResultInput({
    instituteId, subjectId, examName: "Final Examination", examYear: 26, examFullMarks: 100,
    records: [{ studentId, marks: 50 }],
  }), /Exam year/);
  assert.throws(() => validateExamResultInput({
    instituteId, subjectId, examName: "Final Examination", examYear: 2026, examFullMarks: 100,
    records: [
      { studentId, marks: 50 },
      { studentId, marks: 51 },
    ],
  }), /duplicated/);
});
