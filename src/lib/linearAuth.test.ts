import { describe, expect, it } from "vitest";
import { buildLinearAuthHeader } from "./linearAuth";

describe("linearAuth", () => {
  it("personal API key does not receive Bearer prefix", () => {
    expect(buildLinearAuthHeader("lin_api_abc123", "personal_api_key")).toBe(
      "lin_api_abc123",
    );
  });

  it("strips accidental Bearer from personal API key", () => {
    expect(
      buildLinearAuthHeader("Bearer lin_api_abc123", "personal_api_key"),
    ).toBe("lin_api_abc123");
  });

  it("OAuth token receives Bearer prefix", () => {
    expect(buildLinearAuthHeader("access_token_xyz", "oauth")).toBe(
      "Bearer access_token_xyz",
    );
  });

  it("OAuth preserves existing Bearer prefix", () => {
    expect(buildLinearAuthHeader("Bearer access_token_xyz", "oauth")).toBe(
      "Bearer access_token_xyz",
    );
  });
});
