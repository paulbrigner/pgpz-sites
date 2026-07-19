import { describe, expect, it } from "vitest";
import {
  isAutoverifySecretAuthorized,
  resolveAutoverifySecrets,
} from "@/lib/autoverify-secret";

describe("social-proof autoverify secret rotation", () => {
  const currentSecret = "current-autoverify-secret-at-least-32-characters";
  const previousSecret = "previous-autoverify-secret-at-least-32-characters";

  it("accepts the current and previous key during the rotation window", () => {
    expect(
      isAutoverifySecretAuthorized({ suppliedSecret: currentSecret, currentSecret, previousSecret }),
    ).toBe(true);
    expect(
      isAutoverifySecretAuthorized({ suppliedSecret: previousSecret, currentSecret, previousSecret }),
    ).toBe(true);
    expect(
      isAutoverifySecretAuthorized({ suppliedSecret: "attacker", currentSecret, previousSecret }),
    ).toBe(false);
  });

  it("requires strong, distinct production keys", () => {
    expect(() =>
      resolveAutoverifySecrets({ currentSecret: "weak", nodeEnv: "production" }),
    ).toThrow("SOCIAL_PROOF_AUTOVERIFY_SECRET must contain at least 32 bytes");
    expect(() =>
      resolveAutoverifySecrets({
        currentSecret,
        previousSecret: "weak",
        nodeEnv: "production",
      }),
    ).toThrow("SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS must contain at least 32 bytes");
    expect(() =>
      resolveAutoverifySecrets({
        currentSecret,
        previousSecret: currentSecret,
        nodeEnv: "production",
      }),
    ).toThrow("must differ");
  });

  it("keeps an unconfigured local trigger disabled", () => {
    const resolved = resolveAutoverifySecrets({ nodeEnv: "development" });
    expect(resolved).toEqual({ current: null, previous: null });
    expect(
      isAutoverifySecretAuthorized({
        suppliedSecret: "anything",
        currentSecret: resolved.current,
        previousSecret: resolved.previous,
      }),
    ).toBe(false);
  });
});
