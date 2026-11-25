import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeTestDatabaseUrl } from "./test-db-safety.ts";

test("allows only the localhost isolated test database", () => {
  assert.doesNotThrow(() =>
    assertSafeTestDatabaseUrl("postgresql://amrpi_test:secret@127.0.0.1:5433/amrpi_test"),
  );
});

test("rejects remote databases, wrong ports, databases, and users", () => {
  for (const url of [
    "postgresql://amrpi_test:secret@db.example.test:5433/amrpi_test",
    "postgresql://amrpi_test:secret@127.0.0.1:5432/amrpi_test",
    "postgresql://amrpi_test:secret@127.0.0.1:5433/postgres",
    "postgresql://postgres:secret@127.0.0.1:5433/amrpi_test",
  ]) {
    assert.throws(() => assertSafeTestDatabaseUrl(url), /Unsafe test database target/);
  }
});
