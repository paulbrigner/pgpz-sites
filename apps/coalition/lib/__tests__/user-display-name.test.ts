import { describe, expect, it } from "vitest";
import { getUserDisplayName, getUserGreetingName } from "@/lib/user-display-name";

describe("user display names", () => {
  it("keeps full display names available outside email greetings", () => {
    expect(getUserDisplayName({ firstName: "Paul", lastName: "Brigner" })).toBe("Paul Brigner");
  });

  it("uses only the stored first name for email greetings", () => {
    expect(getUserGreetingName({ name: "Paul Brigner", firstName: "Paul", lastName: "Brigner" })).toBe("Paul");
  });

  it("does not parse a first name from a display name", () => {
    expect(getUserGreetingName({ name: "Paul Brigner" })).toBe("there");
  });
});
