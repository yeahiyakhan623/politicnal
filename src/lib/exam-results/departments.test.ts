import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalDepartmentLabel,
  departmentFilterValues,
  fallbackSubjects,
} from "./departments.ts";

test("canonicalizes department aliases, casing, and separators", () => {
  assert.equal(canonicalDepartmentLabel("  CST "), "Computer Technology");
  assert.equal(canonicalDepartmentLabel("FOUNDRY-TECHNOLOGY"), "Foundry Technology");
  assert.equal(canonicalDepartmentLabel("  textile   technology "), "Textile Technology");
});

test("provides normalized filters for canonical names and known aliases", () => {
  assert.deepEqual(departmentFilterValues("Computer Technology"), [
    "computer technology",
    "computer",
    "cst",
  ]);
  assert.deepEqual(departmentFilterValues("Foundry Technology"), [
    "foundry technology",
    "foundry",
    "foundry tech",
    "ft",
  ]);
});

test("builds five distinct fallback subjects for each valid semester", () => {
  for (let semester = 1; semester <= 8; semester += 1) {
    const subjects = fallbackSubjects(semester, "Foundry Technology");
    assert.equal(subjects.length, 5);
    assert.equal(new Set(subjects.map((subject) => subject.code)).size, 5);
    assert.ok(subjects.every((subject) => subject.code.includes(`S${semester}-`)));
  }
  assert.equal(fallbackSubjects(4, "Foundry Technology")[3].name, "Foundry Technology");
  assert.throws(() => fallbackSubjects(9, "Foundry Technology"), /Semester/);
});
