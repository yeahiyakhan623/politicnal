import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PUBLIC_PROFILE } from "./defaults.ts";
import { validatePublicProfile } from "./validation.ts";

test("validates the default institute profile", () => {
  const profile = validatePublicProfile(DEFAULT_PUBLIC_PROFILE);
  assert.equal(profile.instituteName, "AMRPI");
  assert.equal(profile.heroTitle, "Anjuman Moklesur Rahman Polytechnic Institute");
  assert.equal(profile.leadership.length, 3);
  assert.equal(profile.departments.length, 5);
  assert.equal(profile.contact.phones[0], "+88-02222241190");
});

test("rejects unsafe public links and malformed image data", () => {
  assert.throws(() => validatePublicProfile({
    ...DEFAULT_PUBLIC_PROFILE,
    links: [{ id: "bad-link", label: "Unsafe", description: "", url: "javascript:alert(1)" }],
  }), /HTTPS/);
  assert.throws(() => validatePublicProfile({
    ...DEFAULT_PUBLIC_PROFILE,
    leadership: [{ ...DEFAULT_PUBLIC_PROFILE.leadership[0], imageUrl: "data:image/svg+xml;base64,abc" }],
  }), /image must be an HTTPS URL or JPEG, PNG, or WebP upload/);
  assert.throws(() => validatePublicProfile({
    ...DEFAULT_PUBLIC_PROFILE,
    services: [{ id: "bad-service", name: "Download", description: "", url: "javascript:alert(1)" }],
  }), /Service 1 URL must use HTTPS/);
});
