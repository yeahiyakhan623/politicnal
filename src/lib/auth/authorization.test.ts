import assert from "node:assert/strict";
import test from "node:test";
import {
  assertInstituteAccess,
  assertStudentManagementAccess,
  assertStudentReadAccess,
  AuthorizationError,
  type AuthenticatedUser,
} from "./authorization.ts";

const superAdmin: AuthenticatedUser = {
  id: "super-1",
  instituteId: null,
  role: "SUPER_ADMIN",
};

test("only the primary super administrator may manage student records", () => {
  assert.doesNotThrow(() => assertStudentManagementAccess(superAdmin));
  assert.throws(() => assertStudentManagementAccess({
    id: "admin-1",
    instituteId: "institute-1",
    role: "INSTITUTE_ADMIN",
  }), AuthorizationError);
  assert.throws(() => assertStudentManagementAccess({
    id: "teacher-1",
    instituteId: "institute-1",
    role: "TEACHER",
  }), AuthorizationError);
});

test("student and admission officer roles cannot manage student records", () => {
  assert.throws(() => assertStudentManagementAccess({
    id: "student-1",
    instituteId: "institute-1",
    role: "STUDENT",
  }), AuthorizationError);
  assert.throws(() => assertStudentManagementAccess({
    id: "officer-1",
    instituteId: "institute-1",
    role: "ADMISSION_OFFICER",
  }), AuthorizationError);
});

test("only super admin can cross institute boundaries", () => {
  assert.throws(() => assertInstituteAccess({
    id: "admin-1",
    instituteId: "institute-1",
    role: "INSTITUTE_ADMIN",
  }, "another-institute"), AuthorizationError);
  assert.doesNotThrow(() => assertInstituteAccess({
    ...superAdmin,
  }, "another-institute"));
});

test("students can only read the record linked to their user account", () => {
  const studentUser: AuthenticatedUser = {
    id: "student-user-1",
    instituteId: "institute-1",
    role: "STUDENT",
  };
  assert.doesNotThrow(() => assertStudentReadAccess(studentUser, {
    id: "student-record-1",
    instituteId: "institute-1",
    profile: { userId: studentUser.id },
  }));
  assert.throws(() => assertStudentReadAccess(studentUser, {
    id: "another-student-record",
    instituteId: "institute-1",
    profile: { userId: "different-user" },
  }), AuthorizationError);
});
