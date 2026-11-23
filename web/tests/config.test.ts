import { describe, expect, it } from "vitest";
import { parseConfig } from "@/lib/config";

const base = { DATABASE_URL: "postgres://x" };

describe("config", () => {
  it("uses safe defaults", () => {
    const c = parseConfig(base);
    expect(c.APP_NAME).toBe("Choose Your Dr");
    expect(c.CONTACT_DAILY_LIMIT).toBe(5);
    expect(c.OTP_REQUIRED_FROM_CONTACT).toBe(3);
    expect(c.APP_ENV).toBe("local");
  });

  it("lets the business name be changed in one place", () => {
    expect(parseConfig({ ...base, APP_NAME: "Qadam" }).APP_NAME).toBe("Qadam");
  });

  it("reads numbers from text", () => {
    expect(parseConfig({ ...base, CONTACT_DAILY_LIMIT: "8" }).CONTACT_DAILY_LIMIT).toBe(8);
  });

  it("requires DATABASE_URL", () => {
    expect(() => parseConfig({})).toThrow(/DATABASE_URL/);
  });

  it("refuses the development secret in production", () => {
    expect(() => parseConfig({ ...base, APP_ENV: "production" })).toThrow(/SESSION_SECRET/);
    expect(
      parseConfig({ ...base, APP_ENV: "production", SESSION_SECRET: "a-real-long-random-secret-value" }).APP_ENV,
    ).toBe("production");
  });
});
