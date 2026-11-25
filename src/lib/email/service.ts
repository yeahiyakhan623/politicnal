import "server-only";

import nodemailer from "nodemailer";
import { getPasswordResetUrl, getSmtpConfiguration, getStudentPortalUrls } from "@/lib/email/config";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type StudentApprovalEmail = {
  email: string;
  name: string;
  loginId: string;
  temporaryPassword: string;
  rollNumber: string;
  registrationNumber: string;
};

type StudentRejectionEmail = {
  email: string;
  name: string;
  rollNumber: string;
  registrationNumber: string;
  reason: string | null;
};

type StudentRequestReceivedEmail = {
  email: string;
  name: string;
  rollNumber: string;
  registrationNumber: string;
};

type PasswordSetupConfirmationEmail = {
  email: string;
  name: string;
  loginUrl: string;
};

type PasswordResetEmail = {
  email: string;
  name: string;
  token: string;
};

export class EmailServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailServiceError";
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function createTransport() {
  const { from, ...transportOptions } = getSmtpConfiguration();
  return { transport: nodemailer.createTransport(transportOptions), from };
}

function emailErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/[\r\n]/g, " ").slice(0, 500)
    : "Unknown email delivery error.";
}

export async function sendEmail(message: EmailMessage) {
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    const created = createTransport();
    transport = created.transport;
    const { from } = created;
    const result = await transport.sendMail({ from, ...message });
    const recipientAccepted = Array.isArray(result.accepted) && result.accepted.some((value: unknown) => {
      const address = typeof value === "string"
        ? value
        : value && typeof value === "object" && "address" in value && typeof value.address === "string"
          ? value.address
          : "";
      return address.toLowerCase() === message.to.toLowerCase();
    });
    if (!recipientAccepted) {
      throw new EmailServiceError("Email provider did not accept the recipient.");
    }
  } catch (error) {
    throw new EmailServiceError(emailErrorMessage(error));
  } finally {
    transport?.close();
  }
}

export async function verifySmtpConnection() {
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    transport = createTransport().transport;
    await transport.verify();
  } catch (error) {
    throw new EmailServiceError(emailErrorMessage(error));
  } finally {
    transport?.close();
  }
}

export async function sendStudentApprovalEmail(input: StudentApprovalEmail) {
  const { loginUrl } = getStudentPortalUrls();
  const safeName = escapeHtml(input.name);
  const safeLoginId = escapeHtml(input.loginId);
  const safeTemporaryPassword = escapeHtml(input.temporaryPassword);
  const safeRoll = escapeHtml(input.rollNumber);
  const safeRegistration = escapeHtml(input.registrationNumber);
  const safeLoginUrl = escapeHtml(loginUrl);

  await sendEmail({
    to: input.email,
    subject: "Your Student Portal Account Has Been Approved!",
    text: `Hello ${input.name},\n\nYour student portal account has been approved.\nStudent Login ID: ${input.loginId}\nTemporary password: ${input.temporaryPassword}\nRoll number: ${input.rollNumber}\nRegistration number: ${input.registrationNumber}\n\nSign in at ${loginUrl} and change your temporary password immediately. This temporary password can be used only until you set a new password.\n\nIf you did not request this account, contact your institute administrator.`,
    html: `<p>Hello ${safeName},</p><p>Your student portal account has been approved.</p><p><strong>Student Login ID:</strong> ${safeLoginId}<br><strong>Temporary password:</strong> ${safeTemporaryPassword}<br><strong>Roll number:</strong> ${safeRoll}<br><strong>Registration number:</strong> ${safeRegistration}</p><p><a href="${safeLoginUrl}">Sign in to the Student Portal</a> and change your temporary password immediately. This temporary password can be used only until you set a new password.</p><p>If you did not request this account, contact your institute administrator.</p>`,
  });
}

export async function sendStudentRejectionEmail(input: StudentRejectionEmail) {
  const safeName = escapeHtml(input.name);
  const safeRoll = escapeHtml(input.rollNumber);
  const safeRegistration = escapeHtml(input.registrationNumber);
  const reason = input.reason?.trim() || "";
  const safeReason = escapeHtml(reason);
  await sendEmail({
    to: input.email,
    subject: "Update on Your Student Portal Account Request",
    text: `Hello ${input.name},\n\nYour request for a Student Portal account could not be approved at this time.\nRoll number: ${input.rollNumber}\nRegistration number: ${input.registrationNumber}${reason ? `\nReason: ${reason}` : ""}\n\nPlease contact your institute administrator if you need assistance.`,
    html: `<p>Hello ${safeName},</p><p>Your request for a Student Portal account could not be approved at this time.</p><p><strong>Roll number:</strong> ${safeRoll}<br><strong>Registration number:</strong> ${safeRegistration}</p>${reason ? `<p><strong>Reason:</strong> ${safeReason}</p>` : ""}<p>Please contact your institute administrator if you need assistance.</p>`,
  });
}

export async function sendStudentRequestReceivedEmail(input: StudentRequestReceivedEmail) {
  const { loginUrl } = getStudentPortalUrls(process.env);
  const safeName = escapeHtml(input.name);
  const safeRoll = escapeHtml(input.rollNumber);
  const safeRegistration = escapeHtml(input.registrationNumber);
  const safeLoginUrl = escapeHtml(loginUrl);
  await sendEmail({
    to: input.email,
    subject: "We Received Your Student Portal Account Request",
    text: `Hello ${input.name},\n\nWe received your request for Student Portal access. The institute administrator will review it.\nRoll number: ${input.rollNumber}\nRegistration number: ${input.registrationNumber}\n\nYou will receive another email after the request is reviewed. Student Portal: ${loginUrl}`,
    html: `<p>Hello ${safeName},</p><p>We received your request for Student Portal access. The institute administrator will review it.</p><p><strong>Roll number:</strong> ${safeRoll}<br><strong>Registration number:</strong> ${safeRegistration}</p><p>You will receive another email after the request is reviewed.</p><p><a href="${safeLoginUrl}">Student Portal login</a></p>`,
  });
}

export async function sendPasswordSetupConfirmationEmail(input: PasswordSetupConfirmationEmail) {
  const safeName = escapeHtml(input.name);
  const safeLoginUrl = escapeHtml(input.loginUrl);
  await sendEmail({
    to: input.email,
    subject: "Your Student Portal Password Is Ready",
    text: `Hello ${input.name},\n\nYour Student Portal password was set successfully. You can now sign in at ${input.loginUrl}.\n\nIf you did not make this change, contact your institute administrator immediately.`,
    html: `<p>Hello ${safeName},</p><p>Your Student Portal password was set successfully.</p><p><a href="${safeLoginUrl}">Sign in to the Student Portal</a>.</p><p>If you did not make this change, contact your institute administrator immediately.</p>`,
  });
}

export async function sendPasswordResetEmail(input: PasswordResetEmail) {
  const resetUrl = getPasswordResetUrl(input.token);
  const safeName = escapeHtml(input.name);
  const safeResetUrl = escapeHtml(resetUrl);
  await sendEmail({
    to: input.email,
    subject: "Reset your Student Portal password",
    text: `Hello ${input.name},\n\nUse this single-use link to reset your password. It expires in one hour: ${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Hello ${safeName},</p><p>Use this single-use link to reset your password. It expires in one hour.</p><p><a href="${safeResetUrl}">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  });
}
