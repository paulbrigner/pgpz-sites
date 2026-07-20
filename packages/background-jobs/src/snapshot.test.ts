import { describe, expect, it } from "vitest";
import { normalizeBackgroundJobSnapshot } from "./snapshot";

describe("background-job snapshots", () => {
  it("omits nested undefined object fields before fingerprinting and persistence", () => {
    const input = {
      update: {
        sections: [
          {
            heading: "Action Item",
            images: undefined,
          },
        ],
      },
      optional: undefined,
    };

    expect(normalizeBackgroundJobSnapshot(input)).toEqual({
      update: {
        sections: [
          {
            heading: "Action Item",
          },
        ],
      },
    });
    expect(Object.hasOwn(input.update.sections[0], "images")).toBe(true);
  });

  it("uses JSON null semantics for undefined array entries", () => {
    expect(normalizeBackgroundJobSnapshot({ values: ["first", undefined, "last"] })).toEqual({
      values: ["first", null, "last"],
    });
  });

  it("rejects values that cannot form a durable JSON snapshot", () => {
    expect(() => normalizeBackgroundJobSnapshot(undefined)).toThrow(
      "Background-job snapshots must be JSON-serializable.",
    );

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => normalizeBackgroundJobSnapshot(cyclic)).toThrow(
      "Background-job snapshots must be JSON-serializable.",
    );
  });
});
