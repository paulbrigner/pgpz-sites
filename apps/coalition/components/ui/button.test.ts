import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";

describe("button variants", () => {
  it("uses visible danger styles for destructive buttons", () => {
    const className = buttonVariants({ variant: "destructive" });

    expect(className).toContain("bg-rose-700");
    expect(className).toContain("text-white");
    expect(className).toContain("border-rose-800");
  });
});
