import assert from "node:assert/strict";
import test from "node:test";
import { normalizePostgresConnectionString } from "./db-url.ts";

test("normalizes legacy require SSL mode without changing other connection settings", () => {
  assert.equal(
    normalizePostgresConnectionString(
      "postgresql://test:secret@db.example.test/app?sslmode=require&channel_binding=require",
    ),
    "postgresql://test:secret@db.example.test/app?sslmode=verify-full&channel_binding=require",
  );
});

test("preserves connection strings that do not use the legacy require SSL mode", () => {
  const connectionString = "postgresql://localhost/app?sslmode=disable";
  assert.equal(normalizePostgresConnectionString(connectionString), connectionString);
});
