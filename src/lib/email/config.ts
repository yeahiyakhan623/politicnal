export type SmtpConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth: { user: string; pass: string };
  from: string;
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
};

export type SmtpConfigurationStatus = {
  configured: boolean;
  message?: string;
};

const DEFAULT_SMTP_USERNAME = "yeahiamondol862@gmail.com";

type EmailEnvironment = {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_SECURE?: string;
  SMTP_REQUIRE_TLS?: string;
  SMTP_USER?: string;
  SMTP_USERNAME?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
  EMAIL_FROM?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
};

function resolveSmtpConfiguration(
  env: EmailEnvironment,
): { config: SmtpConfiguration } | { error: string } {
  const host = env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(env.SMTP_PORT || 587);
  const username = env.SMTP_USER?.trim() || env.SMTP_USERNAME?.trim() || DEFAULT_SMTP_USERNAME;
  const password = env.SMTP_PASSWORD;
  const normalizedPassword = password?.trim().toLowerCase();
  const from = env.SMTP_FROM?.trim() || env.EMAIL_FROM?.trim() || username;
  const secure = env.SMTP_SECURE === "true";
  const requireTLS = env.SMTP_REQUIRE_TLS !== "false";
  const placeholderPasswords = new Set([
    "changeme",
    "enter-your-google-app-password",
    "placeholder",
    "replace-me",
    "your-app-password",
    "your-google-app-password",
  ]);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return { error: "SMTP_PORT must be a valid TCP port." };
  }
  if (
    !host ||
    !username ||
    typeof password !== "string" ||
    !password.trim() ||
    !normalizedPassword ||
    placeholderPasswords.has(normalizedPassword) ||
    !from
  ) {
    return {
      error: "Email configuration incomplete. Set SMTP_PASSWORD in .env or your deployment secrets.",
    };
  }
  if (port === 587 && (secure || !requireTLS)) {
    return {
      error: "Port 587 must use STARTTLS with SMTP_SECURE=false and SMTP_REQUIRE_TLS=true.",
    };
  }

  return {
    config: {
      host,
      port,
      secure,
      requireTLS,
      auth: { user: username, pass: password },
      from,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    },
  };
}

export function getSmtpConfigurationStatus(
  env: EmailEnvironment = process.env,
): SmtpConfigurationStatus {
  const result = resolveSmtpConfiguration(env);
  if ("config" in result) return { configured: true };
  return { configured: false, message: result.error };
}

export function getSmtpConfiguration(env: EmailEnvironment = process.env): SmtpConfiguration {
  const result = resolveSmtpConfiguration(env);
  if (!("config" in result)) throw new Error(result.error);
  return result.config;
}

export function getStudentPortalUrls(
  env: EmailEnvironment = process.env,
  setupToken?: string,
) {
  const configuredUrl = env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl) throw new Error("NEXT_PUBLIC_APP_URL must be configured.");

  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid student portal URL.");
  }
  if (
    !["http:", "https:"].includes(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password ||
    (env.NODE_ENV === "production" && baseUrl.protocol !== "https:")
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL must use a safe HTTP(S) URL.");
  }

  return {
    loginUrl: new URL("/login", baseUrl.origin).toString(),
    setupUrl: setupToken
      ? new URL(`/setup-password?token=${encodeURIComponent(setupToken)}`, baseUrl.origin).toString()
      : undefined,
  };
}

export function getPasswordResetUrl(token: string, env: EmailEnvironment = process.env) {
  const configuredUrl = env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl) throw new Error("NEXT_PUBLIC_APP_URL must be configured.");

  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid student portal URL.");
  }
  if (
    !["http:", "https:"].includes(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password ||
    (env.NODE_ENV === "production" && baseUrl.protocol !== "https:")
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL must use a safe HTTP(S) URL.");
  }
  return new URL(`/reset-password?token=${encodeURIComponent(token)}`, baseUrl.origin).toString();
}
