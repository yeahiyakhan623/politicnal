import assert from "node:assert/strict";
import test from "node:test";
import { studentNameMatches } from "./registration-validation.ts";

test("matches directory names regardless of case, spacing, or unicode compatibility", () => {
  assert.equal(studentNameMatches("  Ayesha   Rahman ", "ayesha rahman"), true);
  assert.equal(studentNameMatches("Ａｙｅｓｈａ Rahman", "Ayesha Rahman"), true);
});

test("does not accept an empty directory name or a different student name", () => {
  assert.equal(studentNameMatches(null, "Ayesha Rahman"), false);
  assert.equal(studentNameMatches("Ayesha Rahman", "Ayesha Karim"), false);
});
