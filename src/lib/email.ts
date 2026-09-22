import "server-only";
import nodemailer from "nodemailer";
import { getSmtpConfiguration, isEmailDeliveryConfigured } from "@/lib/env";
import { EMAIL_OTP_TTL_MINUTES } from "@/lib/email-otp-code";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);
}

export { isEmailDeliveryConfigured };

export async function sendAdminEmailOtp(input: {
  to: string;
  name: string;
  code: string;
  purpose: "LOGIN" | "ENABLE_MFA";
}): Promise<void> {
  const smtp = getSmtpConfiguration();
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
    requireTLS: !smtp.secure,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const action = input.purpose === "LOGIN" ? "complete your sign-in" : "enable email verification";
  const safeName = escapeHtml(input.name);
  const safeCode = escapeHtml(input.code);
  await transport.sendMail({
    from: smtp.from,
    to: input.to,
    subject: "Your Keyforge verification code",
    text: `Hello ${input.name},\n\nUse ${input.code} to ${action}. It expires in ${EMAIL_OTP_TTL_MINUTES} minutes and can be used once.\n\nIf you did not request this code, change your Keyforge password.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#14201b"><h1 style="font-size:22px">Keyforge verification</h1><p>Hello ${safeName},</p><p>Use this code to ${action}:</p><p style="font:700 32px/1.2 ui-monospace,monospace;letter-spacing:8px;padding:18px;background:#eef8f1;border:1px solid #b8ddc3;border-radius:10px;text-align:center">${safeCode}</p><p>This code expires in ${EMAIL_OTP_TTL_MINUTES} minutes and can be used once.</p><p style="color:#52645c">If you did not request this code, change your Keyforge password.</p></div>`,
  });
}
