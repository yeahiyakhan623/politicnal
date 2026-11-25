import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { requireRoles } from "@/lib/auth/require-user";
import { getSmtpConfigurationStatus } from "@/lib/email/config";
import { sendEmail, verifySmtpConnection } from "@/lib/email/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireRoles("SUPER_ADMIN");
    const configuration = getSmtpConfigurationStatus();
    if (!configuration.configured) {
      return NextResponse.json(
        { success: false, code: "EMAIL_CONFIGURATION_INCOMPLETE", error: configuration.message },
        { status: 503 },
      );
    }
    await verifySmtpConnection();
    await sendEmail({
      to: admin.email,
      subject: "Student Portal SMTP test",
      text: "SMTP connection and test email delivery are working.",
      html: "<p>SMTP connection and test email delivery are working.</p>",
    });
    return NextResponse.json({ success: true, message: `Test email sent to ${admin.email}.` });
  } catch (error) {
    const response = apiError(error);
    if (response) return response;
    console.error(
      "Administrator SMTP test failed.",
      error instanceof Error ? error.message.replace(/[\r\n]/g, " ").slice(0, 500) : "Unknown email error.",
    );
    return NextResponse.json(
      { success: false, code: "EMAIL_DELIVERY_FAILED", error: "SMTP verification or test email delivery failed. Check the email configuration and try again." },
      { status: 503 },
    );
  }
}
