import { describe, expect, it } from "vitest";
import { productionClerkKeyError } from "./config.js";

describe("production Clerk configuration", () => {
  it("accepts live keys in production", () => {
    expect(productionClerkKeyError("production", "pk_live_example", "sk_live_example")).toBeNull();
  });

  it("rejects development keys in production", () => {
    expect(productionClerkKeyError("production", "pk_test_example", "sk_test_example")).toContain("pk_live_");
    expect(productionClerkKeyError("production", "pk_test_example", "")).toContain("pk_live_");
  });

  it("does not require Clerk keys outside production or when unconfigured", () => {
    expect(productionClerkKeyError("development", "pk_test_example", "sk_test_example")).toBeNull();
    expect(productionClerkKeyError("production", "", "")).toBeNull();
  });
});
