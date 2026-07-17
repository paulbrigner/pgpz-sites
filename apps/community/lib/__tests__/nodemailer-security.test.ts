import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Nodemailer types are not installed in this app.
import nodemailer from "nodemailer";

describe("Nodemailer security and compatibility", () => {
  it("composes the standard message shape used by the application", async () => {
    const transporter = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: "unix",
    });

    const result = await transporter.sendMail({
      from: "PGPZ <sender@example.test>",
      to: "member@example.test",
      subject: "PGPZ mail transport smoke test",
      text: "Plain-text message",
      html: "<p>HTML message</p>",
    });

    const message = Buffer.isBuffer(result.message)
      ? result.message.toString("utf8")
      : String(result.message);
    expect(message).toContain("Subject: PGPZ mail transport smoke test");
    expect(message).toContain("member@example.test");
    expect(message).toContain("Plain-text message");
  });

  it("handles deeply nested recipient groups without crashing the process", () => {
    const script = `
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true });
      const recipient = Array.from({ length: 3000 }, (_, index) => "group" + index + ":").join("") + "member@example.test;";
      Promise.resolve(transporter.sendMail({
        from: "sender@example.test",
        to: recipient,
        subject: "Nested group regression",
        text: "Regression message"
      })).then(
        () => process.stdout.write("handled"),
        () => process.stdout.write("handled")
      );
    `;
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("handled");
  });

  it("blocks raw message content from reading local files", async () => {
    const transporter = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      disableFileAccess: true,
      disableUrlAccess: true,
    });

    await expect(
      transporter.sendMail({
        from: "sender@example.test",
        to: "member@example.test",
        raw: { path: resolve(process.cwd(), "package.json") },
      }),
    ).rejects.toMatchObject({ code: "EFILEACCESS" });
  });
});
