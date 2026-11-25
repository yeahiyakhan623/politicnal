import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGpa,
  calculateSubjectResult,
  validateGradeRules,
  type GradeRule,
} from "./grading.ts";

const gradingRules: GradeRule[] = [
  { letterGrade: "F", minimumPercent: 0, maximumPercent: 40, gradePoint: 0, isPassing: false },
  { letterGrade: "D", minimumPercent: 40, maximumPercent: 50, gradePoint: 1, isPassing: true },
  { letterGrade: "C", minimumPercent: 50, maximumPercent: 60, gradePoint: 2, isPassing: true },
  { letterGrade: "B", minimumPercent: 60, maximumPercent: 70, gradePoint: 3, isPassing: true },
  { letterGrade: "A", minimumPercent: 70, maximumPercent: 80, gradePoint: 3.5, isPassing: true },
  { letterGrade: "A+", minimumPercent: 80, maximumPercent: 100, gradePoint: 4, isPassing: true },
];

test("calculates component totals, percentage, grade, and pass status", () => {
  const result = calculateSubjectResult(
    { written: 48, mcq: 18, practical: 14 },
    { maximum: { written: 60, mcq: 20, practical: 20 }, passMarks: 40 },
    gradingRules,
  );

  assert.equal(result.totalMarks, 80);
  assert.equal(result.maximumMarks, 100);
  assert.equal(result.percentage, 80);
  assert.equal(result.letterGrade, "A+");
  assert.equal(result.gradePoint, 4);
  assert.equal(result.isPassing, true);
});

test("does not pass a student whose total is below the configured pass marks", () => {
  const result = calculateSubjectResult(
    { written: 24, mcq: 8, practical: 7 },
    { maximum: { written: 60, mcq: 20, practical: 20 }, passMarks: 40 },
    gradingRules,
  );

  assert.equal(result.letterGrade, "F");
  assert.equal(result.isPassing, false);
});

test("rejects marks above a component maximum", () => {
  assert.throws(
    () => calculateSubjectResult(
      { written: 61, mcq: 0, practical: 0 },
      { maximum: { written: 60, mcq: 20, practical: 20 }, passMarks: 40 },
      gradingRules,
    ),
    /written marks must be between 0 and 60/,
  );
});

test("rejects grading rules with gaps", () => {
  assert.throws(
    () => validateGradeRules([
      { letterGrade: "F", minimumPercent: 0, maximumPercent: 40, gradePoint: 0, isPassing: false },
      { letterGrade: "A", minimumPercent: 50, maximumPercent: 100, gradePoint: 4, isPassing: true },
    ]),
    /without gaps or overlaps/,
  );
});

test("calculates credit-weighted GPA and rounds to two decimals", () => {
  const result = calculateGpa([
    { credit: 3, gradePoint: 3.5 },
    { credit: 1.5, gradePoint: 4 },
  ]);

  assert.equal(result.totalCredits, 4.5);
  assert.equal(result.gpa, 3.67);
});

test("rejects a subject with a non-positive credit value", () => {
  assert.throws(() => calculateGpa([{ credit: 0, gradePoint: 4 }]), /greater than zero/);
});
