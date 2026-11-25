import assert from "node:assert/strict";
import test from "node:test";
import { validatePublicResultSearch } from "./validation.ts";

const searchBase = {
  instituteId: "45ad7283-a6e7-4611-9df2-dd7e7110732a",
  sessionYear: "2025-26",
  semester: 3,
  department: "Computer Technology",
  examType: "Final Examination",
};

test("supports searching by roll number without registration number", () => {
  const result = validatePublicResultSearch({ ...searchBase, rollNumber: "12345" });
  assert.equal(result.searchBy, "rollNumber");
  assert.equal(result.searchValue, "12345");
});

test("supports name and registration searches as separate optional identifiers", () => {
  assert.equal(
    validatePublicResultSearch({ ...searchBase, studentName: "A Student" }).searchBy,
    "studentName",
  );
  assert.equal(
    validatePublicResultSearch({ ...searchBase, registrationNumber: "REG-123" }).searchBy,
    "registrationNumber",
  );
});

test("requires exactly one search identifier and validates academic filters", () => {
  assert.throws(() => validatePublicResultSearch(searchBase), /exactly one/);
  assert.throws(() => validatePublicResultSearch({
    ...searchBase, rollNumber: "123", studentName: "A Student",
  }), /exactly one/);
  assert.throws(() => validatePublicResultSearch({
    ...searchBase, rollNumber: "123", examType: "Quiz",
  }), /exam type/i);
  assert.throws(() => validatePublicResultSearch({
    ...searchBase, rollNumber: "123", semester: 9,
  }), /semester/i);
});
