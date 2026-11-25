import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getPasswordResetUrl,
  getSmtpConfiguration,
  getSmtpConfigurationStatus,
  getStudentPortalUrls,
} from "./config.ts";

test("uses Gmail STARTTLS settings and requested SMTP environment names", () => {
  const config = getSmtpConfiguration({
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_REQUIRE_TLS: "true",
    SMTP_USER: "yeahiamondol862@gmail.com",
    SMTP_PASSWORD: "test-app-password",
    SMTP_FROM: "yeahiamondol862@gmail.com",
  });

  assert.equal(config.host, "smtp.gmail.com");
  assert.equal(config.port, 587);
  assert.equal(config.secure, false);
  assert.equal(config.requireTLS, true);
  assert.equal(config.auth.user, "yeahiamondol862@gmail.com");
  assert.equal(config.auth.pass, "test-app-password");
  assert.equal(config.from, "yeahiamondol862@gmail.com");
});

test("reports incomplete SMTP configuration without throwing when password is blank", () => {
  const status = getSmtpConfigurationStatus({
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "587",
    SMTP_USER: "yeahiamondol862@gmail.com",
    SMTP_PASSWORD: "   ",
    SMTP_FROM: "yeahiamondol862@gmail.com",
  });

  assert.deepEqual(status, {
    configured: false,
    message: "Email configuration incomplete. Set SMTP_PASSWORD in .env or your deployment secrets.",
  });
  assert.equal(getSmtpConfigurationStatus({
    SMTP_PASSWORD: "enter-your-google-app-password",
  }).configured, false);
  assert.throws(
    () => getSmtpConfiguration({
      SMTP_USER: "yeahiamondol862@gmail.com",
      SMTP_PASSWORD: "",
    }),
    /Email configuration incomplete/,
  );
});

test("enforces STARTTLS on port 587 and validates the TCP port", () => {
  assert.throws(
    () => getSmtpConfiguration({
      SMTP_PORT: "587",
      SMTP_SECURE: "true",
      SMTP_PASSWORD: "test-app-password",
    }),
    /STARTTLS/,
  );
  assert.throws(
    () => getSmtpConfiguration({ SMTP_PORT: "not-a-port", SMTP_PASSWORD: "test-app-password" }),
    /valid TCP port/,
  );
  assert.equal(
    getSmtpConfigurationStatus({ SMTP_PORT: "not-a-port", SMTP_PASSWORD: "test-app-password" }).message,
    "SMTP_PORT must be a valid TCP port.",
  );
});

test("builds setup and login links from configured application URL", () => {
  const urls = getStudentPortalUrls(
    { NEXT_PUBLIC_APP_URL: "http://localhost:3000/" },
    "single-use-token",
  );

  assert.equal(urls.loginUrl, "http://localhost:3000/login");
  assert.equal(urls.setupUrl, "http://localhost:3000/setup-password?token=single-use-token");
  assert.equal(
    getPasswordResetUrl("one-time-token", { NEXT_PUBLIC_APP_URL: "http://localhost:3000/" }),
    "http://localhost:3000/reset-password?token=one-time-token",
  );
});

test("rejects localhost URLs for production password setup emails", () => {
  assert.throws(
    () => getStudentPortalUrls({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "production",
    }),
    /safe HTTP\(S\) URL/,
  );
  assert.throws(
    () => getPasswordResetUrl("token", {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "production",
    }),
    /safe HTTP\(S\) URL/,
  );
});
