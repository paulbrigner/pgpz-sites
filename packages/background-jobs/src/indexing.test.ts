import { describe, expect, it } from "vitest";
import {
  jobStatusIndexKeys,
  recentJobIndexKeys,
  taskStatusIndexKeys,
} from "./indexing";

describe("background-job indexes", () => {
  it("creates stable recent and status index keys", () => {
    expect(recentJobIndexKeys({ jobId: "job-1", createdAt: "2026-07-19T12:00:00.000Z" }))
      .toEqual({
        GSI1PK: "BACKGROUND_JOB",
        GSI1SK: "2026-07-19T12:00:00.000Z#job-1",
      });
    expect(jobStatusIndexKeys({
      jobId: "job-1",
      status: "running",
      updatedAt: "2026-07-19T12:01:00.000Z",
    })).toEqual({
      GSI2PK: "BACKGROUND_JOB_STATUS#running",
      GSI2SK: "2026-07-19T12:01:00.000Z#job-1",
    });
  });

  it("partitions task statuses by parent job", () => {
    expect(taskStatusIndexKeys({
      jobId: "job-1",
      taskId: "task-1",
      status: "delivery_unknown",
      updatedAt: "2026-07-19T12:02:00.000Z",
    })).toEqual({
      GSI2PK: "BACKGROUND_JOB#job-1#TASK_STATUS#delivery_unknown",
      GSI2SK: "2026-07-19T12:02:00.000Z#task-1",
    });
  });
});
