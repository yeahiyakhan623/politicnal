import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_HOURS,
} from "./password-reset.ts";

test("password reset tokens are random, URL-safe, and stored as one-way hashes", () => {
  const first = createPasswordResetToken();
  const second = createPasswordResetToken();

  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.tokenHash, hashPasswordResetToken(first.token));
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.token, first.tokenHash);
  assert.notEqual(first.token, second.token);
  assert.equal(PASSWORD_RESET_TOKEN_TTL_HOURS, 1);
});
