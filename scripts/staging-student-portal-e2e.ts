import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { normalizePostgresConnectionString } from "../src/lib/db-url.ts";

type CapturedEmail = { recipient: string; data: string };
type JsonRecord = Record<string, unknown>;

const staging = dotenv.parse(await readFile(".env.staging", "utf8"));
const local = dotenv.parse(await readFile(".env", "utf8"));
const required = [
  "STAGING_DATABASE_URL",
  "STAGING_NEON_PROJECT_ID",
  "STAGING_NEON_BRANCH_ID",
  "PRODUCTION_NEON_PROJECT_ID",
  "PRODUCTION_NEON_BRANCH_ID",
];
if (process.env.STAGING_E2E !== "1") {
  throw new Error("Set STAGING_E2E=1 to explicitly start staging-only integration tests.");
}
if (required.some((key) => !staging[key]?.trim())) {
  throw new Error("Staging integration test configuration is incomplete.");
}
if (
  Object.hasOwn(staging, "DATABASE_URL") ||
  staging.MIGRATION_TARGET !== "staging" ||
  staging.ALLOW_STAGING_MIGRATIONS !== "false" ||
  staging.STAGING_RECOVERY_VERIFIED !== "true" ||
  staging.STAGING_NEON_PROJECT_ID !== staging.PRODUCTION_NEON_PROJECT_ID ||
  staging.STAGING_NEON_BRANCH_ID === staging.PRODUCTION_NEON_BRANCH_ID ||
  !local.DATABASE_URL ||
  new URL(staging.STAGING_DATABASE_URL!).hostname === new URL(local.DATABASE_URL).hostname
) {
  throw new Error("Staging-only integration safety checks failed.");
}

const smtpInboxSuffix = "@amrpi-test.invalid";
const createdByTestAt = new Date();
const runId = randomUUID();
const stagingDistDir = `.next-staging-e2e-${runId}`;
const adminEmail = `admin-${runId}${smtpInboxSuffix}`;
const studentOne = {
  name: `E2E Student One ${runId.slice(0, 8)}`,
  father: "Fictional Parent One",
  roll: `E2E-${runId.slice(0, 8)}-01`,
  registration: `E2E-${runId.slice(0, 8)}-REG01`,
  email: `student-one-${runId}${smtpInboxSuffix}`,
  phone: "+8801700000001",
};
const studentTwo = {
  name: `E2E Student Two ${runId.slice(0, 8)}`,
  father: "Fictional Parent Two",
  roll: `E2E-${runId.slice(0, 8)}-02`,
  registration: `E2E-${runId.slice(0, 8)}-REG02`,
  email: `student-two-${runId}${smtpInboxSuffix}`,
  phone: "+8801700000002",
};
const testPassword = `Initial-${runId.slice(0, 12)}!`;
const resetPassword = `Reset-${runId.slice(0, 12)}!`;
const studentEmail = (student: typeof studentOne) => student.email;
const mail: CapturedEmail[] = [];
const rejectedMailRecipients = new Set<string>();
const rateLimitKeys = new Set<string>();
const checks: string[] = [];
let pool: pg.Pool | undefined;
let smtpServer: ReturnType<typeof createNetServer> | undefined;
let app: ChildProcess | undefined;
let appOutput = "";
let appSpawnError: string | undefined;
let stagingDistDirCreated = false;
let instituteId: string | undefined;
let studentOneId: string | undefined;
let studentTwoId: string | undefined;
let adminId: string | undefined;
let appOrigin = "";
let smtpPort = 0;
function pass(name: string) {
  checks.push(name);
  console.log(`PASS ${name}`);
}

function rateKey(ip: string, identity: string) {
  return createHash("sha256").update(`${ip}:${identity}`).digest("hex");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeServerDiagnostics() {
  return appOutput
    .split(/\r?\n/)
    .filter((line) => /Super Admin setup failed|error:|constraint|relation .* does not exist|column .* does not exist/i.test(line))
    .slice(-5)
    .map((line) =>
      line
        .replaceAll(staging.STAGING_DATABASE_URL!, "[redacted staging URL]")
        .replaceAll(local.DATABASE_URL!, "[redacted production URL]")
        .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[redacted endpoint]")
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
        .replace(/((?:password|token)\s*[:=]\s*)\S+/gi, "$1[redacted]"),
    )
    .join(" | ");
}

function smtpSink() {
  const server = createNetServer((socket) => {
    socket.setEncoding("utf8");
    socket.write("220 AMRPI E2E local-only mail sink\r\n");
    let pending = "";
    let inData = false;
    let message = "";
    let currentRecipient = "";
    let authState: "plain" | "login-user" | "login-password" | null = null;
    socket.on("data", (chunk: string) => {
      pending += chunk;
      while (pending.includes("\n")) {
        const lineEnd = pending.indexOf("\n");
        const line = pending.slice(0, lineEnd).replace(/\r$/, "");
        pending = pending.slice(lineEnd + 1);
        if (inData) {
          if (line === ".") {
            mail.push({ recipient: currentRecipient, data: message });
            inData = false;
            message = "";
            socket.write("250 Message captured locally\r\n");
          } else {
            message += `${line.replace(/^\.\./, ".")}\r\n`;
          }
          continue;
        }
        if (authState) {
          if (authState === "login-user") {
            authState = "login-password";
            socket.write("334 UGFzc3dvcmQ6\r\n");
          } else {
            authState = null;
            socket.write("235 Authentication accepted by local sink\r\n");
          }
          continue;
        }
        if (/^EHLO\b|^HELO\b/i.test(line)) {
          socket.write("250-amrpi-local-sink\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 10000000\r\n");
        } else if (/^AUTH PLAIN\s+\S+/i.test(line)) {
          socket.write("235 Authentication accepted by local sink\r\n");
        } else if (/^AUTH PLAIN$/i.test(line)) {
          authState = "plain";
          socket.write("334 \r\n");
        } else if (/^AUTH LOGIN$/i.test(line)) {
          authState = "login-user";
          socket.write("334 VXNlcm5hbWU6\r\n");
        } else if (/^MAIL FROM:/i.test(line)) {
          socket.write("250 Sender accepted\r\n");
        } else if (/^RCPT TO:/i.test(line)) {
          const recipient = line.match(/^RCPT TO:\s*<([^>]+)>/i)?.[1]?.toLowerCase() ?? "";
          if (!recipient.endsWith(smtpInboxSuffix) || rejectedMailRecipients.has(recipient)) {
            socket.write("550 Local sink accepts only the synthetic .invalid mailbox\r\n");
          } else {
            currentRecipient = recipient;
            socket.write("250 Recipient accepted by local sink\r\n");
          }
        } else if (/^DATA$/i.test(line)) {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (/^RSET$/i.test(line)) {
          currentRecipient = "";
          socket.write("250 Reset\r\n");
        } else if (/^NOOP$/i.test(line)) {
          socket.write("250 OK\r\n");
        } else if (/^QUIT$/i.test(line)) {
          socket.write("221 Bye\r\n");
          socket.end();
        } else {
          socket.write("250 OK\r\n");
        }
      }
    });
  });
  return server;
}

async function freePort() {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "localhost", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a local test port.");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function startApp() {
  const port = await freePort();
  appOrigin = `http://localhost:${port}`;
  const nextCli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
  await mkdir(stagingDistDir);
  stagingDistDirCreated = true;
  const childEnv: NodeJS.ProcessEnv = {
    DATABASE_URL: staging.STAGING_DATABASE_URL!,
    NEXT_PUBLIC_APP_URL: appOrigin,
    NODE_ENV: "development",
    STAGING_E2E: "1",
    STAGING_E2E_DIST_DIR: stagingDistDir,
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtpPort),
    SMTP_SECURE: "false",
    SMTP_REQUIRE_TLS: "false",
    SMTP_USER: "local-e2e-user",
    SMTP_PASSWORD: "local-e2e-password",
    SMTP_FROM: `noreply${smtpInboxSuffix}`,
    STAGING_RECOVERY_VERIFIED: "true",
    ALLOW_STAGING_MIGRATIONS: "false",
  };
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "HOMEDRIVE",
    "HOMEPATH",
    "PATHEXT",
    "ComSpec",
  ]) {
    if (process.env[key]) childEnv[key] = process.env[key];
  }
  app = spawn(process.execPath, [nextCli, "dev", "--hostname", "localhost", "--port", String(port)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv,
  });
  const capture = (chunk: Buffer) => {
    appOutput = `${appOutput}${chunk.toString("utf8")}`.slice(-16_000);
  };
  app.on("error", (error) => {
    appSpawnError = (error as NodeJS.ErrnoException).code ?? "process spawn failed";
  });
  app.stdout?.on("data", capture);
  app.stderr?.on("data", capture);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) {
      const diagnostics = appOutput
        .split(/\r?\n/)
        .slice(-8)
        .map((line) =>
          line
            .replaceAll(staging.STAGING_DATABASE_URL!, "[redacted staging URL]")
            .replaceAll(local.DATABASE_URL!, "[redacted production URL]")
            .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[redacted endpoint]")
            .replace(/((?:password|token)\s*[:=]\s*)\S+/gi, "$1[redacted]"),
        )
        .join(" | ");
      throw new Error(
        `Local Next.js staging test server exited with code ${app.exitCode}${appSpawnError ? ` (${appSpawnError})` : ""}${diagnostics ? `: ${diagnostics}` : "."}`,
      );
    }
    try {
      const response = await fetch(`${appOrigin}/api/auth/session`, { signal: AbortSignal.timeout(2_000) });
      if (response.status === 401) return;
    } catch {
      await delay(500);
    }
  }
  throw new Error("Local Next.js staging test server did not become ready.");
}

async function api(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {},
) {
  const timeoutMs = 60_000;
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${appOrigin}${path}`, {
      method: options.method ?? "GET",
      headers: {
        origin: appOrigin,
        "x-real-ip": "127.0.0.1",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await response.text();
  } catch (error) {
    const name = error instanceof Error ? error.name : "request failure";
    throw new Error(`Staging request ${new URL(path, appOrigin).pathname} failed (${name}).`);
  }
  let body: JsonRecord = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as JsonRecord;
    }
  } catch {
    body = { html: text };
  }
  return { response, body, text };
}

function assertStatus(result: { response: Response; body: JsonRecord }, expected: number, label: string) {
  const detail = typeof result.body.error === "string" ? `: ${result.body.error}` : "";
  assert.equal(result.response.status, expected, `${label} returned HTTP ${result.response.status}${detail}`);
}

function record(value: unknown): JsonRecord {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as JsonRecord;
}

function records(value: unknown): JsonRecord[] {
  assert.ok(Array.isArray(value));
  return value.map(record);
}

function sessionCookie(response: Response) {
  const cookies = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  const value = cookies.find((cookie) => cookie.startsWith("eduportal_session="));
  assert.ok(value, "Expected an authentication session cookie.");
  return value!.split(";", 1)[0]!;
}

function decodedEmails(afterIndex: number) {
  return mail
    .slice(afterIndex)
    .map(({ data }) =>
      data
        .replace(
          /Content-Transfer-Encoding:\s*base64[^\r\n]*\r?\n(?:[^\r\n]*\r?\n)*?\r?\n([\s\S]*?)(?=\r?\n--[^\r\n]+|$)/gi,
          (_match, encoded: string) => Buffer.from(encoded.replace(/\s/g, ""), "base64").toString("utf8"),
        )
        .replace(/=\r?\n/g, "")
        .replace(/=([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))),
    )
    .join("\n");
}

async function postJson(path: string, body: unknown, cookie?: string) {
  return api(path, { method: "POST", body, cookie });
}

function approvalTemporaryPassword(afterIndex: number) {
  const text = decodedEmails(afterIndex);
  const match = text.match(/Temporary password:\s*([A-Za-z0-9_-]{24})/);
  assert.ok(match, "The local approval email did not contain a temporary password.");
  return match[1]!;
}

function passwordResetToken(afterIndex: number) {
  const text = decodedEmails(afterIndex);
  const match = text.match(/token=([A-Za-z0-9_-]{43})/);
  assert.ok(match, "The local reset email did not contain a password reset link.");
  return match[1]!;
}

async function seedBusinessRecords(adminUserId: string) {
  assert.ok(pool);
  const institute = await pool.query<{ id: string }>(
    `INSERT INTO public.institutes
       (name, type, official_email, registration_id, category, review_status, reviewed_by, reviewed_at)
     VALUES ($1, 'polytechnic', $2, $3, 'polytechnic', 'approved', $4, now())
     RETURNING id`,
    [`E2E Synthetic Institute ${runId.slice(0, 8)}`, `institute-${runId}${smtpInboxSuffix}`, `E2E-${runId}`, adminUserId],
  );
  instituteId = institute.rows[0]!.id;
  const batch = await pool.query<{ id: string }>(
    `INSERT INTO public.class_batches (institute_id, name, category, academic_year)
     VALUES ($1, $2, 'polytechnic', '2025-2026')
     RETURNING id`,
    [instituteId, `E2E Batch ${runId.slice(0, 8)}`],
  );
  const students = await pool.query<{ id: string; roll_number: string }>(
    `INSERT INTO public.students
       (institute_id, class_batch_id, full_name, roll_number, registration_number, email, father_name,
        student_phone, semester, department, session_year, is_active, approval_status)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,1,'Computer Technology','2025-26',true,'approved'),
       ($1,$2,$9,$10,$11,$12,$13,$14,1,'Computer Technology','2025-26',true,'approved')
     RETURNING id, roll_number`,
    [
      instituteId,
      batch.rows[0]!.id,
      studentOne.name,
      studentOne.roll,
      studentOne.registration,
      studentOne.email,
      studentOne.father,
      studentOne.phone,
      studentTwo.name,
      studentTwo.roll,
      studentTwo.registration,
      studentTwo.email,
      studentTwo.father,
      studentTwo.phone,
    ],
  );
  studentOneId = students.rows.find((row) => row.roll_number === studentOne.roll)?.id;
  studentTwoId = students.rows.find((row) => row.roll_number === studentTwo.roll)?.id;
  assert.ok(studentOneId && studentTwoId);
}

async function cleanup() {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (adminId) {
      await client.query(
        `DELETE FROM public.admin_audit_logs
         WHERE actor_user_id = $1 AND created_at >= $2`,
        [adminId, createdByTestAt],
      );
    }
    if (instituteId) {
      await client.query("DELETE FROM public.institutes WHERE id = $1", [instituteId]);
    }
    if (adminId) {
      await client.query("DELETE FROM public.users WHERE id = $1", [adminId]);
    }
    if (rateLimitKeys.size) {
      await client.query(
        "DELETE FROM public.eduportal_login_attempts WHERE key_hash = ANY($1::char(64)[])",
        [[...rateLimitKeys]],
      );
    }
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    throw new Error("Synthetic staging test cleanup failed; records were not broadly deleted.");
  } finally {
    client.release();
  }
  const remaining = await pool.query<{ users: number; institutes: number; students: number; requests: number }>(
    `SELECT
       (SELECT count(*)::int FROM public.users WHERE email = $1) AS users,
       (SELECT count(*)::int FROM public.institutes WHERE id = $2) AS institutes,
       (SELECT count(*)::int FROM public.students WHERE id = ANY($3::uuid[])) AS students,
       (SELECT count(*)::int FROM public.student_account_requests
        WHERE student_id = ANY($3::uuid[])) AS requests`,
    [adminEmail, instituteId ?? null, [studentOneId, studentTwoId].filter(Boolean)],
  );
  assert.deepEqual(remaining.rows[0], { users: 0, institutes: 0, students: 0, requests: 0 });
}

try {
  pool = new pg.Pool({
    connectionString: normalizePostgresConnectionString(staging.STAGING_DATABASE_URL!),
    max: 3,
    connectionTimeoutMillis: 10_000,
    application_name: "amrpi-staging-student-portal-e2e",
  });
  const identity = await pool.query<{
    database: string;
    project_id: string | null;
    branch_id: string | null;
    ro: string;
  }>(
    `SELECT current_database() AS database,
            current_setting('neon.project_id', true) AS project_id,
            current_setting('neon.branch_id', true) AS branch_id,
            current_setting('transaction_read_only') AS ro`,
  );
  assert.equal(identity.rows[0]?.project_id, staging.STAGING_NEON_PROJECT_ID);
  assert.equal(identity.rows[0]?.project_id, staging.PRODUCTION_NEON_PROJECT_ID);
  assert.equal(identity.rows[0]?.branch_id, staging.STAGING_NEON_BRANCH_ID);
  assert.notEqual(identity.rows[0]?.branch_id, staging.PRODUCTION_NEON_BRANCH_ID);
  assert.equal(identity.rows[0]?.database, "neondb");
  assert.equal(identity.rows[0]?.ro, "off");
  pass("live staging branch identity and production separation");

  const starting = await pool.query<{ users: number; institutes: number; students: number; requests: number }>(
    `SELECT (SELECT count(*)::int FROM public.users) AS users,
            (SELECT count(*)::int FROM public.institutes) AS institutes,
            (SELECT count(*)::int FROM public.students) AS students,
            (SELECT count(*)::int FROM public.student_account_requests) AS requests`,
  );
  assert.deepEqual(starting.rows[0], { users: 0, institutes: 0, students: 0, requests: 0 });
  pass("clean staging starting state");

  const server = smtpSink();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  smtpServer = server;
  const smtpAddress = server.address();
  if (!smtpAddress || typeof smtpAddress === "string") throw new Error("Could not start local-only mail sink.");
  smtpPort = smtpAddress.port;
  await startApp();

  const adminSetupIp = "127.0.0.1";
  const setupProbeEmail = `setup-probe-${runId}${smtpInboxSuffix}`;
  rateLimitKeys.add(rateKey(adminSetupIp, `setup:${setupProbeEmail}`));
  rateLimitKeys.add(rateKey(adminSetupIp, "setup:*"));
  const setupProbe = await pool.query<{ id: string }>(
    `INSERT INTO public.institutes
       (name, type, official_email, registration_id, category, review_status)
     VALUES ($1, 'polytechnic', $2, $3, 'polytechnic', 'pending')
     RETURNING id`,
    [`E2E Bootstrap Guard ${runId.slice(0, 8)}`, setupProbeEmail, `GUARD-${runId}`],
  );
  instituteId = setupProbe.rows[0]!.id;
  const blockedSetup = await postJson("/api/auth/setup", {
    name: `Unauthorized E2E Setup ${runId.slice(0, 8)}`,
    email: setupProbeEmail,
    password: `Probe-${runId.slice(0, 12)}!`,
  });
  if (blockedSetup.response.status === 201) {
    adminId = record(blockedSetup.body.user).id as string;
  }
  assertStatus(blockedSetup, 409, "Super Admin bootstrap on an initialized system");
  const probeUser = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM public.users WHERE email = $1",
    [setupProbeEmail],
  );
  assert.equal(probeUser.rows[0]?.count, 0);
  await pool.query("DELETE FROM public.institutes WHERE id = $1", [instituteId]);
  instituteId = undefined;
  pass("unauthorized Super Admin bootstrap blocked when institute data exists");

  rateLimitKeys.add(rateKey(adminSetupIp, `setup:${adminEmail}`));
  const adminSetup = await postJson("/api/auth/setup", {
    name: `E2E Admin ${runId.slice(0, 8)}`,
    email: adminEmail,
    password: `Admin-${runId.slice(0, 12)}!`,
  });
  assertStatus(adminSetup, 201, "Super Admin setup");
  const adminCookie = sessionCookie(adminSetup.response);
  adminId = record(adminSetup.body.user).id as string;
  assert.ok(adminId);
  await seedBusinessRecords(adminId!);
  pass("synthetic admin and two approved staging students created");

  rateLimitKeys.add(rateKey(adminSetupIp, "student-account-request"));
  const submitRequest = async (student: typeof studentOne) => postJson("/api/public/student-registrations", {
    instituteId,
    fullName: student.name,
    fatherName: student.father,
    roll: student.roll,
    registration: student.registration,
    email: studentEmail(student),
    phone: student.phone,
  });
  const firstRequest = await submitRequest(studentOne);
  assertStatus(firstRequest, 201, "student request submission");
  assert.equal(firstRequest.body.success, true);
  assert.equal(firstRequest.body.emailSent, true);
  const requestId = firstRequest.body.requestId as string;
  assert.ok(requestId);
  const afterFirstReceipt = mail.length;
  const duplicateRequest = await submitRequest(studentOne);
  assertStatus(duplicateRequest, 200, "duplicate pending request update");
  assert.equal(duplicateRequest.body.updated, true);
  const requestCount = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM public.student_account_requests WHERE student_id = $1",
    [studentOneId],
  );
  assert.equal(requestCount.rows[0]?.count, 1);
  assert.equal(mail.length, afterFirstReceipt);
  pass("student request submission and duplicate prevention");

  const secondRequest = await submitRequest(studentTwo);
  assertStatus(secondRequest, 201, "second synthetic student request");
  assert.equal(secondRequest.body.emailSent, true);
  const secondRequestId = secondRequest.body.requestId as string;
  assert.ok(secondRequestId);
  const listing = await api(`/api/admin/pending-requests?instituteId=${instituteId}`, { cookie: adminCookie });
  assertStatus(listing, 200, "admin request listing");
  const listedRequests = records(listing.body.studentRequests);
  assert.ok(listedRequests.some((request) => request.id === requestId));
  assert.ok(listedRequests.some((request) => request.id === secondRequestId));
  const anonymousAdminListing = await api(`/api/admin/pending-requests?instituteId=${instituteId}`);
  assertStatus(anonymousAdminListing, 401, "unauthenticated admin request listing");
  pass("admin request listing");

  rejectedMailRecipients.add(studentTwo.email);
  const reject = await api("/api/admin/pending-requests", {
    method: "PATCH",
    cookie: adminCookie,
    body: {
      kind: "student",
      action: "reject",
      id: secondRequestId,
      instituteId,
      rejectionReason: "Synthetic end-to-end rejection test.",
    },
  });
  assertStatus(reject, 200, "admin rejection");
  assert.equal(reject.body.success, true);
  assert.equal(reject.body.emailSent, false);
  const rejected = await pool.query<{ status: string; rejection_reason: string; reviewed_by: string }>(
    "SELECT status, rejection_reason, reviewed_by FROM public.student_account_requests WHERE id = $1",
    [secondRequestId],
  );
  assert.equal(rejected.rows[0]?.status, "rejected");
  assert.equal(rejected.rows[0]?.rejection_reason, "Synthetic end-to-end rejection test.");
  assert.equal(rejected.rows[0]?.reviewed_by, adminId);
  const failedDelivery = await pool.query<{ status: string; attempt_count: number }>(
    `SELECT status, attempt_count FROM public.student_account_email_deliveries
     WHERE request_id = $1 AND notification_type = 'rejection'`,
    [secondRequestId],
  );
  assert.deepEqual(failedDelivery.rows[0], { status: "failed", attempt_count: 1 });
  rejectedMailRecipients.delete(studentTwo.email);
  const retryRejection = await api("/api/admin/pending-requests", {
    method: "PATCH",
    cookie: adminCookie,
    body: {
      kind: "student",
      action: "retry_email",
      id: secondRequestId,
      instituteId,
      notificationType: "rejection",
    },
  });
  assertStatus(retryRejection, 200, "rejection email retry");
  assert.equal(retryRejection.body.emailSent, true);
  const retriedDelivery = await pool.query<{ status: string; attempt_count: number }>(
    `SELECT status, attempt_count FROM public.student_account_email_deliveries
     WHERE request_id = $1 AND notification_type = 'rejection'`,
    [secondRequestId],
  );
  assert.deepEqual(retriedDelivery.rows[0], { status: "sent", attempt_count: 2 });
  pass("admin rejection, delivery failure tracking, retry, and decision history");

  const beforeApprovalMail = mail.length;
  await pool.query("UPDATE public.users SET username = $2 WHERE id = $1", [adminId, studentOne.roll]);
  const approve = await api("/api/admin/pending-requests", {
    method: "PATCH",
    cookie: adminCookie,
    body: { kind: "student", action: "approve", id: requestId, instituteId },
  });
  assertStatus(approve, 200, "admin approval");
  assert.equal(approve.body.success, true);
  assert.equal(approve.body.emailSent, true);
  assert.equal(JSON.stringify(approve.body).includes("Temporary password:"), false);
  const temporaryPassword = approvalTemporaryPassword(beforeApprovalMail);
  const account = await pool.query<{ id: string; student_id: string; role: string; username: string; password_hash: string; password_change_required: boolean }>(
    "SELECT id, student_id, role, username, password_hash, password_change_required FROM public.users WHERE student_id = $1",
    [studentOneId],
  );
  assert.equal(account.rows.length, 1);
  assert.equal(account.rows[0]?.role, "student");
  assert.equal(account.rows[0]?.password_change_required, true);
  assert.equal(account.rows[0]?.student_id, studentOneId);
  assert.notEqual(account.rows[0]?.password_hash, temporaryPassword);
  assert.match(account.rows[0]!.password_hash, /^\$2[aby]\$\d\d\$/);
  const loginId = `${studentOne.roll}-${studentOneId!.slice(0, 8)}`;
  assert.equal(account.rows[0]?.username, loginId);
  assert.ok(decodedEmails(beforeApprovalMail).includes(`Student Login ID: ${loginId}`));
  assert.ok(mail.slice(beforeApprovalMail).some((message) => message.recipient === studentOne.email));
  const localEmailText = decodedEmails(0);
  assert.ok(mail.length >= 4);
  assert.ok(mail.every((message) => message.recipient.endsWith(smtpInboxSuffix)));
  assert.ok(localEmailText.includes("We Received Your Student Portal Account Request"));
  assert.ok(localEmailText.includes("Your Student Portal Account Has Been Approved"));
  assert.ok(localEmailText.includes("could not be approved at this time"));
  const emailHistory = await api(`/api/admin/pending-requests?instituteId=${instituteId}`, { cookie: adminCookie });
  assertStatus(emailHistory, 200, "email delivery history");
  const emailRequests = records(emailHistory.body.studentRequests);
  assert.equal(emailRequests.find((request) => request.id === requestId)?.requestEmailStatus, "sent");
  assert.equal(emailRequests.find((request) => request.id === requestId)?.loginId, loginId);
  assert.equal(emailRequests.find((request) => request.id === requestId)?.approvalEmailStatus, "sent");
  assert.equal(emailRequests.find((request) => request.id === secondRequestId)?.rejectionEmailStatus, "sent");
  assert.ok(decodedEmails(beforeApprovalMail).includes("change your temporary password immediately"));
  const duplicateApproval = await api("/api/admin/pending-requests", {
    method: "PATCH",
    cookie: adminCookie,
    body: { kind: "student", action: "approve", id: requestId, instituteId },
  });
  assertStatus(duplicateApproval, 409, "duplicate student approval");
  assert.equal(mail.length, beforeApprovalMail + 1);
  pass("admin approval, unique login ID, hashed temporary password, email, and duplicate approval protection");

  rateLimitKeys.add(rateKey(adminSetupIp, loginId));
  rateLimitKeys.add(rateKey(adminSetupIp, "*"));
  const temporaryLogin = await postJson("/api/auth/login", { identifier: loginId, password: temporaryPassword });
  assertStatus(temporaryLogin, 200, "student login by emailed Login ID and temporary password");
  const temporaryCookie = sessionCookie(temporaryLogin.response);
  assert.equal(record(temporaryLogin.body.user).role, "student");
  const initialDashboard = await api("/student", { cookie: temporaryCookie });
  assertStatus(initialDashboard, 200, "first-login password change prompt");
  assert.ok(initialDashboard.text.includes("Secure your new account"));
  const setPassword = await postJson(
    "/api/auth/change-password",
    { currentPassword: temporaryPassword, newPassword: testPassword },
    temporaryCookie,
  );
  assertStatus(setPassword, 200, "mandatory first-login password change");
  const loggedInCookie = sessionCookie(setPassword.response);
  const oldTemporaryLogin = await postJson("/api/auth/login", { identifier: loginId, password: temporaryPassword });
  assertStatus(oldTemporaryLogin, 401, "temporary password invalidated after first-login change");
  pass("temporary credential login, forced first-login password change, and temporary password invalidation");
  const session = await api("/api/auth/session", { cookie: loggedInCookie });
  assertStatus(session, 200, "student session lookup");
  assert.equal(record(session.body.user).studentId, studentOneId);
  const studentAdminListing = await api(`/api/admin/pending-requests?instituteId=${instituteId}`, { cookie: loggedInCookie });
  assertStatus(studentAdminListing, 403, "student access to admin request listing");
  pass("student login, authenticated session, and admin access denial");

  const profile = await api("/student", { cookie: loggedInCookie });
  assertStatus(profile, 200, "student dashboard");
  assert.ok(profile.text.includes(studentOne.name));
  assert.ok(profile.text.includes(studentOne.roll));
  assert.ok(profile.text.includes(studentOne.registration));
  assert.ok(profile.text.includes("Computer Technology"));
  assert.ok(profile.text.includes("1st Semester"));
  assert.ok(!profile.text.includes(studentTwo.name));
  assert.ok(!profile.text.includes(studentTwo.roll));
  pass("student profile, identifiers, academic details, and student-to-student isolation");

  const createSubject = await api("/api/exam-results", {
    method: "POST",
    cookie: adminCookie,
    body: {
      action: "createSubject",
      instituteId,
      semester: 1,
      department: "Computer Technology",
      name: "Synthetic E2E Subject",
      code: `E2E-${runId.slice(0, 8)}`,
      maximumMarks: 100,
    },
  });
  assertStatus(createSubject, 201, "synthetic subject creation");
  const subjectId = createSubject.body.id as string;
  assert.ok(subjectId);
  const publishResults = await api("/api/exam-results", {
    method: "POST",
    cookie: adminCookie,
    body: {
      action: "publishResults",
      instituteId,
      subjectId,
      examName: "Final Examination",
      examYear: 2026,
      examFullMarks: 100,
      records: [
        { studentId: studentOneId, marks: 84 },
        { studentId: studentTwoId, marks: 72 },
      ],
    },
  });
  assertStatus(publishResults, 200, "result publishing");
  assert.equal(publishResults.body.published, 2);
  const roster = await api(
    `/api/exam-results?mode=roster&instituteId=${instituteId}&subjectId=${subjectId}&examName=${encodeURIComponent("Final Examination")}&examYear=2026`,
    { cookie: adminCookie },
  );
  assertStatus(roster, 200, "results roster");
  assert.equal(records(roster.body.data).length, 2);
  pass("results creation, publishing, and roster");

  const saveFees = await api("/api/student-fees", {
    method: "PATCH",
    cookie: adminCookie,
    body: {
      instituteId,
      studentId: studentOneId,
      sessionYear: "2025-26",
      semester: 1,
      feeAmount: 12000,
      paidAmount: 7500,
    },
  });
  assertStatus(saveFees, 200, "semester fee update");
  const fees = await api("/api/student-fees", { cookie: loggedInCookie });
  assertStatus(fees, 200, "student fee summary");
  const studentFees = records(fees.body.fees);
  assert.equal(studentFees.length, 1);
  assert.equal(Number(studentFees[0]!.feeAmount), 12000);
  assert.equal(Number(studentFees[0]!.paidAmount), 7500);
  assert.equal(Number(studentFees[0]!.feeAmount) - Number(studentFees[0]!.paidAmount), 4500);
  pass("semester fees, paid amount, and dues");

  const attendanceDate = new Date().toISOString().slice(0, 10);
  const saveAttendance = await api("/api/attendance", {
    method: "POST",
    cookie: adminCookie,
    body: {
      instituteId,
      semester: 1,
      department: "Computer Technology",
      date: attendanceDate,
      records: [
        { studentId: studentOneId, status: "present" },
        { studentId: studentTwoId, status: "absent" },
      ],
    },
  });
  assertStatus(saveAttendance, 200, "attendance save");
  assert.equal(saveAttendance.body.saved, 2);
  const attendance = await api(
    `/api/attendance?mode=history&instituteId=${instituteId}&date=${attendanceDate}&semester=1`,
    { cookie: adminCookie },
  );
  assertStatus(attendance, 200, "attendance history");
  assert.equal(record(attendance.body.pagination).total, 2);
  assert.equal(records(attendance.body.data).find((entry) => entry.studentId === studentOneId)?.status, "present");
  const updatedProfile = await api("/student", { cookie: loggedInCookie });
  assert.ok(updatedProfile.text.includes("Synthetic E2E Subject"));
  assert.ok(updatedProfile.text.includes("84"));
  assert.ok(updatedProfile.text.includes("4500.00"));
  pass("attendance records and student dashboard academic summaries");

  const deactivateStudent = await api(`/api/students/${studentOneId}?instituteId=${instituteId}`, {
    method: "DELETE",
    cookie: adminCookie,
  });
  assertStatus(deactivateStudent, 200, "student account deactivation");
  const deactivatedAccount = await pool.query<{ is_active: boolean }>(
    "SELECT is_active FROM public.users WHERE id = (SELECT account_user_id FROM public.student_account_requests WHERE id = $1)",
    [requestId],
  );
  assert.equal(deactivatedAccount.rows[0]?.is_active, false);
  const revokedStudentSession = await api("/api/auth/session", { cookie: loggedInCookie });
  assertStatus(revokedStudentSession, 401, "session revocation on student deactivation");
  rateLimitKeys.add(rateKey(adminSetupIp, loginId));
  rateLimitKeys.add(rateKey(adminSetupIp, "*"));
  const inactiveLogin = await postJson("/api/auth/login", { identifier: loginId, password: testPassword });
  assertStatus(inactiveLogin, 401, "login blocked for deactivated student");

  const reactivateStudent = await api(`/api/students/${studentOneId}`, {
    method: "PATCH",
    cookie: adminCookie,
    body: {
      instituteId,
      semester: 1,
      department: "Computer Technology",
      sessionYear: "2025-26",
      fullName: studentOne.name,
      rollNumber: studentOne.roll,
      registrationNumber: studentOne.registration,
      email: studentOne.email,
      studentPhone: studentOne.phone,
      fatherName: studentOne.father,
      status: "active",
    },
  });
  assertStatus(reactivateStudent, 200, "student account reactivation");
  const reactivatedAccount = await pool.query<{ is_active: boolean }>(
    "SELECT is_active FROM public.users WHERE id = (SELECT account_user_id FROM public.student_account_requests WHERE id = $1)",
    [requestId],
  );
  assert.equal(reactivatedAccount.rows[0]?.is_active, true);
  pass("admin student account activation and deactivation");

  const deliveryStatuses = await api(`/api/admin/pending-requests?instituteId=${instituteId}`, { cookie: adminCookie });
  assertStatus(deliveryStatuses, 200, "request and delivery status listing");
  const finalRequests = records(deliveryStatuses.body.studentRequests);
  assert.equal(finalRequests.find((request) => request.id === requestId)?.status, "approved");
  assert.equal(finalRequests.find((request) => request.id === secondRequestId)?.status, "rejected");
  assert.equal(finalRequests.find((request) => request.id === requestId)?.approvalEmailStatus, "sent");
  assert.equal(finalRequests.find((request) => request.id === secondRequestId)?.rejectionEmailStatus, "sent");
  pass("admin approval/rejection decision and notification history");

  const duplicateAccount = await submitRequest(studentOne);
  assertStatus(duplicateAccount, 409, "duplicate request against active student account");
  pass("duplicate account prevention after approval");

  const beforeResetMail = mail.length;
  rateLimitKeys.add(rateKey(adminSetupIp, `password-reset:${studentOne.email}`));
  rateLimitKeys.add(rateKey(adminSetupIp, "password-reset:*"));
  const resetRequest = await postJson("/api/auth/request-password-reset", { email: studentOne.email });
  assertStatus(resetRequest, 200, "password reset request");
  const resetToken = passwordResetToken(beforeResetMail);
  rateLimitKeys.add(rateKey(adminSetupIp, `password-reset:${tokenHash(resetToken)}`));
  const completeReset = await postJson("/api/auth/reset-password", { token: resetToken, password: resetPassword });
  assertStatus(completeReset, 200, "password reset completion");
  const staleSession = await api("/api/auth/session", { cookie: loggedInCookie });
  assertStatus(staleSession, 401, "session invalidation after password reset");
  rateLimitKeys.add(rateKey(adminSetupIp, studentOne.email));
  rateLimitKeys.add(rateKey(adminSetupIp, "*"));
  const resetLogin = await postJson("/api/auth/login", { email: studentOne.email, password: resetPassword });
  assertStatus(resetLogin, 200, "login after password reset");
  const logout = await api("/api/auth/logout", {
    method: "POST",
    cookie: sessionCookie(resetLogin.response),
  });
  assertStatus(logout, 200, "student logout");
  const afterLogout = await api("/api/auth/session", { cookie: sessionCookie(resetLogin.response) });
  assertStatus(afterLogout, 401, "session revocation after logout");
  pass("password reset, reset email generation, login, and logout");

  assert.ok(mail.length >= 5);
  assert.ok(mail.every((message) => message.recipient.endsWith(smtpInboxSuffix)));
  assert.ok(mail.some((message) => message.data.includes("We Received Your Student Portal Account Request")));
  assert.ok(mail.some((message) => message.data.includes("Student Portal Account Has Been Approved")));
  assert.ok(mail.some((message) => message.data.includes("could not be approved")));
  assert.ok(decodedEmails(beforeApprovalMail).includes("Temporary password:"));
  assert.ok(mail.some((message) => message.data.includes("Reset your Student Portal password")));
  pass(`email generation and delivery tracking in local sink (${mail.length} messages, no external delivery)`);
} catch (error) {
  const failedCheck = error instanceof Error ? error.message.split("\n")[0] : "Unknown integration-test failure";
  const diagnostics = safeServerDiagnostics();
  console.error(`FAIL staging integration workflow (${failedCheck})${diagnostics ? ` | ${diagnostics}` : ""}`);
  process.exitCode = 1;
} finally {
  let appStopped = true;
  if (app?.pid) {
    if (app.exitCode === null && app.signalCode === null) {
      app.kill();
      appStopped = await Promise.race([
        once(app, "exit").then(() => true),
        delay(15_000).then(() => false),
      ]);
    }
  }
  if (smtpServer) {
    await new Promise<void>((resolve) => smtpServer!.close(() => resolve()));
  }
  if (!appStopped) {
    console.error("Local staging test server did not stop; synthetic database records were left untouched.");
    process.exitCode = 1;
  } else {
    if (stagingDistDirCreated) {
      try {
        await rm(stagingDistDir, { recursive: true, force: true });
      } catch {
        console.error("Temporary staging test build directory cleanup failed.");
        process.exitCode = 1;
      }
    }
    try {
      await cleanup();
      console.log("PASS exact synthetic-record cleanup");
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Synthetic cleanup failed.");
      process.exitCode = 1;
    }
  }
  await pool?.end();
  console.log(`STAGING_E2E_CHECKS=${checks.length}`);
}
