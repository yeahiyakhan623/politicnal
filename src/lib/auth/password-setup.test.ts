import assert from "node:assert/strict";
import { test } from "node:test";
import { createPasswordSetupToken, hashPasswordSetupToken } from "./password-setup.ts";

test("password setup tokens are high-entropy URL-safe values stored as hashes", () => {
  const first = createPasswordSetupToken();
  const second = createPasswordSetupToken();

  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.tokenHash, first.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(hashPasswordSetupToken(first.token), first.tokenHash);
});
