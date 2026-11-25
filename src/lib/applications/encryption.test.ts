import assert from "node:assert/strict";
import test from "node:test";

process.env.ADMISSION_DATA_ENCRYPTION_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const { decryptApplicantData, encryptApplicantData } = await import("./encryption.ts");

test("encrypts and decrypts applicant data", () => {
  const data = { fullName: "Sample Applicant", email: "applicant@example.test", phone: "0123456789" };
  const encrypted = encryptApplicantData(data);
  assert.notEqual(encrypted.toString("utf8"), JSON.stringify(data));
  assert.deepEqual(decryptApplicantData<typeof data>(encrypted), data);
});

test("rejects modified ciphertext", () => {
  const encrypted = encryptApplicantData({ fullName: "Sample Applicant" });
  encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 1;
  assert.throws(() => decryptApplicantData(encrypted));
});
