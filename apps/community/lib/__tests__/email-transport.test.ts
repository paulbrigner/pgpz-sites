import { describe, expect, it } from "vitest";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import {
  buildSesServerConfig,
  resolveEmailTransportMode,
} from "@/lib/admin/email-transport";

describe("email transport", () => {
  it("requires SES in production and rejects an SMTP override", () => {
    expect(
      resolveEmailTransportMode({ configuredTransport: "ses", nodeEnv: "production" }),
    ).toBe("ses");
    expect(() =>
      resolveEmailTransportMode({ configuredTransport: "smtp", nodeEnv: "production" }),
    ).toThrow("EMAIL_TRANSPORT=ses is required in production");
    expect(() =>
      resolveEmailTransportMode({ configuredTransport: undefined, nodeEnv: "production" }),
    ).toThrow("EMAIL_TRANSPORT=ses is required in production");
  });

  it("preserves SMTP for local and non-AWS environments", () => {
    expect(
      resolveEmailTransportMode({ configuredTransport: "smtp", nodeEnv: "development" }),
    ).toBe("smtp");
    expect(
      resolveEmailTransportMode({ configuredTransport: undefined, nodeEnv: "test" }),
    ).toBe("smtp");
  });

  it("constructs the Nodemailer SESv2 transport with the default AWS chain", () => {
    const config = buildSesServerConfig("us-east-1");
    expect(config.SES.sesClient).toBeInstanceOf(SESv2Client);
    expect(config.SES.SendEmailCommand).toBe(SendEmailCommand);
  });
});
