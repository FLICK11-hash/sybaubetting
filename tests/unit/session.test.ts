import { describe, it, expect } from "vitest";
import { createSessionToken, isValidSessionToken, verifyPassword } from "@/lib/auth/session";

describe("createSessionToken / isValidSessionToken", () => {
  it("is deterministic for the same password", async () => {
    const tokenA = await createSessionToken("hunter2");
    const tokenB = await createSessionToken("hunter2");
    expect(tokenA).toBe(tokenB);
  });

  it("differs for different passwords", async () => {
    const tokenA = await createSessionToken("hunter2");
    const tokenB = await createSessionToken("something-else");
    expect(tokenA).not.toBe(tokenB);
  });

  it("validates a token created from the same password", async () => {
    const token = await createSessionToken("correct-horse-battery-staple");
    expect(await isValidSessionToken(token, "correct-horse-battery-staple")).toBe(true);
  });

  it("rejects a token created from a different password", async () => {
    const token = await createSessionToken("correct-horse-battery-staple");
    expect(await isValidSessionToken(token, "wrong-password")).toBe(false);
  });

  it("rejects a missing token", async () => {
    expect(await isValidSessionToken(undefined, "any-password")).toBe(false);
  });

  it("rejects a garbage token", async () => {
    expect(await isValidSessionToken("not-a-real-token", "any-password")).toBe(false);
  });
});

describe("verifyPassword", () => {
  it("accepts the correct password", async () => {
    expect(await verifyPassword("swordfish", "swordfish")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    expect(await verifyPassword("wrong", "swordfish")).toBe(false);
  });

  it("rejects an empty candidate against a real password", async () => {
    expect(await verifyPassword("", "swordfish")).toBe(false);
  });

  it("handles passwords of different lengths without throwing", async () => {
    expect(await verifyPassword("short", "a-much-longer-password-value")).toBe(false);
  });
});
