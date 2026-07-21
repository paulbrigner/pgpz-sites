import { beforeEach, describe, expect, it, vi } from "vitest";

const backgroundJobMocks = vi.hoisted(() => ({
  authorized: vi.fn(),
  claim: vi.fn(),
  releaseForRetry: vi.fn(),
}));

const processorMocks = vi.hoisted(() => ({
  coalition: vi.fn(),
  email: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/background-jobs", () => ({
  claimBackgroundJobTask: backgroundJobMocks.claim,
  isAuthorizedBackgroundJobRequest: backgroundJobMocks.authorized,
  releaseBackgroundJobTaskForRetry: backgroundJobMocks.releaseForRetry,
}));
vi.mock("@/lib/admin/coalition-background-job-processor", () => ({
  processCoalitionBackgroundJobTask: processorMocks.coalition,
}));
vi.mock("@/lib/admin/email-background-job-processor", () => ({
  processEmailBackgroundJobTask: processorMocks.email,
}));

import { POST } from "@/app/api/internal/background-jobs/process/route";

const claim = {
  outcome: "claimed",
  job: {
    id: "job-1",
    kind: "admin_signup_notification",
  },
  task: {
    taskId: "task-1",
  },
  leaseToken: "lease-1",
};

describe("coalition background-job process route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backgroundJobMocks.authorized.mockReturnValue(true);
    backgroundJobMocks.claim.mockResolvedValue(claim);
    backgroundJobMocks.releaseForRetry.mockResolvedValue(undefined);
    processorMocks.email.mockResolvedValue({ outcome: "sent", retry: false });
    processorMocks.coalition.mockResolvedValue({ outcome: "completed", retry: false });
  });

  it("routes admin signup notification jobs through the email processor", async () => {
    const response = await POST(
      new Request("https://coalition.pgpz.org/api/internal/background-jobs/process", {
        method: "POST",
        headers: { authorization: "Bearer test" },
        body: JSON.stringify({ version: 1, jobId: "job-1", taskId: "task-1" }),
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      outcome: "sent",
      retry: false,
    });
    expect(processorMocks.email).toHaveBeenCalledWith(claim);
    expect(processorMocks.coalition).not.toHaveBeenCalled();
    expect(backgroundJobMocks.releaseForRetry).not.toHaveBeenCalled();
  });
});
