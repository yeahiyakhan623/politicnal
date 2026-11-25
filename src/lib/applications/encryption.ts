import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const configured = process.env.ADMISSION_DATA_ENCRYPTION_KEY ?? "";
  const key = /^[0-9a-f]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");
  if (key.byteLength !== 32) {
    throw new Error("ADMISSION_DATA_ENCRYPTION_KEY must be configured as a 32-byte base64 or 64-character hex key.");
  }
  return key;
}

export function encryptApplicantData(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
}

export function decryptApplicantData<T>(value: Buffer) {
  if (value.byteLength < 30 || value[0] !== 1) {
    throw new Error("Applicant data has an unsupported encrypted format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), value.subarray(1, 13));
  decipher.setAuthTag(value.subarray(13, 29));
  const decrypted = Buffer.concat([
    decipher.update(value.subarray(29)),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted) as T;
}
