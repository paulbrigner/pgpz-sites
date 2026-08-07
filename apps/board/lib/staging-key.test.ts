import { describe, expect, it } from "vitest";
import { isBoardStagingKey } from "./object-store";

const UUID = "3f9d1c2a-6b8e-4f21-a5c0-7d3e9b2a1f88";

describe("isBoardStagingKey", () => {
  it("accepts only the server-issued board/staging/<uuid> shape", () => {
    expect(isBoardStagingKey(`board/staging/${UUID}`)).toBe(true);
  });

  it("rejects retained object keys, other prefixes, and free-form strings", () => {
    // Retained objects live under board/objects/... — never promotable as a staging key.
    expect(isBoardStagingKey(`board/objects/doc-1/${UUID}`)).toBe(false);
    // A different actor/app prefix is not the board staging namespace.
    expect(isBoardStagingKey(`coalition/staging/${UUID}`)).toBe(false);
    expect(isBoardStagingKey(`community/staging/${UUID}`)).toBe(false);
    // Path traversal / extra segments / missing UUID must fail.
    expect(isBoardStagingKey("board/staging/../objects/x")).toBe(false);
    expect(isBoardStagingKey(`board/staging/${UUID}/extra`)).toBe(false);
    expect(isBoardStagingKey("board/staging/nope")).toBe(false);
    expect(isBoardStagingKey("staging/uuid")).toBe(false);
    expect(isBoardStagingKey("board/staging/")).toBe(false);
  });

  it("rejects non-strings and empty input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isBoardStagingKey(undefined as any)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isBoardStagingKey(null as any)).toBe(false);
    expect(isBoardStagingKey("")).toBe(false);
  });
});
