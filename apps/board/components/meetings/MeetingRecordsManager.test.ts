import { describe, expect, it } from "vitest";
import { buildMeetingDocumentCreatePayload } from "./MeetingRecordsManager";

describe("meeting document create payload", () => {
  it("classifies governed material as meeting-owned", () => {
    expect(buildMeetingDocumentCreatePayload({
      stagingKey: "board/staging/11111111-1111-4111-8111-111111111111",
      fileName: "packet.pdf",
      title: "Board packet",
      description: "Preparation material",
      meetingId: "meeting-1",
      meetingSection: "preparation",
    })).toMatchObject({
      action: "create",
      ownerType: "meeting",
      meetingId: "meeting-1",
      meetingSection: "preparation",
      category: "meeting-records",
    });
  });
});
