import { describe, expect, it } from "vitest";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { buildBoardSesTransport, buildBoardSmtpTransport, resolveBoardEmailTransportMode } from "@/lib/email-transport";

describe("Board email transport", () => {
  it("requires SES in production", () => {
    expect(resolveBoardEmailTransportMode({ configuredTransport: "ses", nodeEnv: "production" })).toBe("ses");
    expect(() => resolveBoardEmailTransportMode({ configuredTransport: "smtp", nodeEnv: "production" })).toThrow("EMAIL_TRANSPORT=ses is required in production");
    expect(() => resolveBoardEmailTransportMode({ nodeEnv: "production" })).toThrow("EMAIL_TRANSPORT=ses is required in production");
  });

  it("defaults non-production environments to SMTP", () => {
    expect(resolveBoardEmailTransportMode({ nodeEnv: "test" })).toBe("smtp");
  });

  it("uses the default AWS credential chain for SES", () => {
    const config = buildBoardSesTransport("us-east-1");
    expect(config.SES.sesClient).toBeInstanceOf(SESv2Client);
    expect(config.SES.SendEmailCommand).toBe(SendEmailCommand);
  });

  it("does not retry an ambiguous timeout when a single-attempt SES transport is requested", async () => {
    const transport = buildBoardSesTransport("us-east-1", { maxAttempts: 1 });
    expect(await transport.SES.sesClient.config.maxAttempts()).toBe(1);
    let dispatches = 0;
    const client = new SESv2Client({ region: "us-east-1", maxAttempts: transport.SES.sesClient.config.maxAttempts,
      credentials: { accessKeyId: "synthetic", secretAccessKey: "synthetic" },
      requestHandler: { handle: async () => { dispatches++; const error = new Error("Synthetic lost response"); error.name = "TimeoutError"; throw error; } },
    });
    await expect(client.send(new SendEmailCommand({ FromEmailAddress: "sender@example.invalid", Destination: { ToAddresses: ["recipient@example.invalid"] }, Content: { Simple: { Subject: { Data: "Synthetic" }, Body: { Text: { Data: "Synthetic" } } } } }))).rejects.toMatchObject({ name: "TimeoutError", $metadata: { attempts: 1 } });
    expect(dispatches).toBe(1); client.destroy(); transport.SES.sesClient.destroy();
  });
  it("disables opportunistic TLS only for local MailHog", () => {
    expect(buildBoardSmtpTransport({ host: "localhost", port: "1025", secure: "false" })).toMatchObject({
      host: "localhost", port: 1025, secure: false, ignoreTLS: true,
    });
    expect(buildBoardSmtpTransport({ host: "smtp.example.org", port: "587", secure: "false" })).not.toHaveProperty("ignoreTLS");
  });
});
